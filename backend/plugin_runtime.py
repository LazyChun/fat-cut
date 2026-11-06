"""
FatNotes Plugin Backend Runtime

Lightweight JSON-RPC server for bespoke plugin backends.
Reads requests from stdin, dispatches to registered handlers, writes responses
to stdout. The host process communicates with this script via subprocess
stdin/stdout pipes.

Usage in your plugin's backend/main.py:

    from plugin_runtime import handler, run

    @handler("myHandler")
    def my_handler(params):
        return {"result": "ok"}

    if __name__ == "__main__":
        run()
"""

import sys
import json
import asyncio
import traceback
import os
from urllib import request as _urlrequest
from urllib import error as _urlerror
from typing import Callable, Dict, Any, Optional

_handlers: Dict[str, Callable] = {}


def _host_base_url() -> str:
    return (os.getenv("FAT_NOTES_PLUGIN_HOST_URL") or "").strip().rstrip("/")


def _host_plugin_id() -> str:
    return (os.getenv("FAT_NOTES_PLUGIN_ID") or "").strip()


def _host_api_token() -> str:
    return (os.getenv("FAT_NOTES_API_TOKEN") or "").strip()


def _host_request_headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = _host_api_token()
    if token:
        headers["X-Fat-Api-Token"] = token
    return headers


def _host_call(method: str, params: Optional[Dict[str, Any]] = None) -> Any:
    base = _host_base_url()
    pid = _host_plugin_id()
    if not base:
        raise RuntimeError("FAT_NOTES_PLUGIN_HOST_URL is not set")
    if not pid:
        raise RuntimeError("FAT_NOTES_PLUGIN_ID is not set")
    url = f"{base}/app/pluginBackend/hostCall"
    payload = json.dumps(
        {"pluginId": pid, "method": method, "params": params or {}},
        ensure_ascii=False,
    ).encode("utf-8")
    req = _urlrequest.Request(
        url,
        data=payload,
        headers=_host_request_headers(),
        method="POST",
    )
    opener = _urlrequest.build_opener(_urlrequest.ProxyHandler({}))
    try:
        with opener.open(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
    except _urlerror.HTTPError as e:
        err = e.read().decode("utf-8", errors="ignore")
        if e.code == 401 and not _host_api_token():
            err = f"{err} FAT_NOTES_API_TOKEN is not set".strip()
        raise RuntimeError(f"Host API HTTPError {e.code}: {err}") from e
    except Exception as e:
        raise RuntimeError(f"Host API request failed: {e}") from e
    try:
        data = json.loads(body)
    except Exception as e:
        raise RuntimeError(f"Host API invalid response: {body[:200]}") from e
    if isinstance(data, dict) and data.get("isOk") is False:
        raise RuntimeError(data.get("message") or "Host API call failed")
    if isinstance(data, dict):
        return data.get("data")
    return data


def host_get_login_info() -> Dict[str, Any]:
    result = _host_call("auth.getLoginInfo", {})
    return result if isinstance(result, dict) else {}


def host_get_system_paths() -> Dict[str, Any]:
    """获取宿主软件的工作目录及配置路径信息。"""
    result = _host_call("system.getPaths", {})
    return result if isinstance(result, dict) else {}


def host_get_plugin_config() -> Dict[str, Any]:
    result = _host_call("pluginConfig.get", {})
    return result if isinstance(result, dict) else {}


def host_set_plugin_config(
    config_data: Optional[Dict[str, Any]], merge: bool = True
) -> Dict[str, Any]:
    if not isinstance(config_data, dict):
        config_data = {}
    result = _host_call(
        "pluginConfig.set",
        {"config": config_data, "merge": bool(merge)},
    )
    return result if isinstance(result, dict) else {}


def handler(name: str):
    """Decorator to register a backend handler.

    Args:
        name: The handler name that the frontend will use to invoke this function
              via sdk.backend.invoke(name, params).

    Example:
        @handler("processFile")
        def process_file(params):
            file_path = params.get("path")
            # ... do work ...
            return {"status": "done"}
    """
    def decorator(fn: Callable) -> Callable:
        _handlers[name] = fn
        return fn
    return decorator


def list_handlers():
    """Return a list of all registered handler names."""
    return list(_handlers.keys())


def _execute_handler(fn: Callable, params: Dict[str, Any]) -> Any:
    """Execute a handler function, supporting both sync and async."""
    if asyncio.iscoroutinefunction(fn):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            # If there's already a running loop, create a new one in a thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, fn(params))
                return future.result()
        else:
            return asyncio.run(fn(params))
    else:
        return fn(params)


def run():
    """Main loop: read JSON-RPC requests from stdin, dispatch, write responses to stdout.

    Protocol:
        Request (one JSON object per line):
            {"id": "req-1", "handler": "handlerName", "params": {"key": "value"}}

        Response (one JSON object per line):
            {"id": "req-1", "status": "success", "result": <any>}
            {"id": "req-1", "status": "error", "error": "message", "traceback": "..."}

    Special handlers (built-in):
        - "__ping__": Returns {"pong": true} — used by host to check process health.
        - "__list_handlers__": Returns list of registered handler names.
        - "__shutdown__": Gracefully exits the process.
    """
    # Signal readiness to the host
    ready_msg = json.dumps({"status": "ready", "handlers": list_handlers()})
    print(ready_msg)
    sys.stdout.flush()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # stdin closed — host terminated the pipe
                break

            line = line.strip()
            if not line:
                continue

            try:
                req = json.loads(line)
            except json.JSONDecodeError as e:
                resp = {"id": None, "status": "error", "error": f"Invalid JSON: {e}"}
                print(json.dumps(resp, ensure_ascii=False))
                sys.stdout.flush()
                continue

            req_id = req.get("id")
            handler_name = req.get("handler", "")
            params = req.get("params", {})

            # Built-in handlers
            if handler_name == "__ping__":
                resp = {"id": req_id, "status": "success", "result": {"pong": True}}
            elif handler_name == "__list_handlers__":
                resp = {"id": req_id, "status": "success", "result": list_handlers()}
            elif handler_name == "__shutdown__":
                resp = {"id": req_id, "status": "success", "result": {"shutdown": True}}
                print(json.dumps(resp, ensure_ascii=False))
                sys.stdout.flush()
                break
            else:
                fn = _handlers.get(handler_name)
                if not fn:
                    resp = {
                        "id": req_id,
                        "status": "error",
                        "error": f"Handler not found: {handler_name}. Available: {list_handlers()}",
                    }
                else:
                    try:
                        result = _execute_handler(fn, params)
                        resp = {"id": req_id, "status": "success", "result": result}
                    except Exception as e:
                        resp = {
                            "id": req_id,
                            "status": "error",
                            "error": str(e),
                            "traceback": traceback.format_exc(),
                        }

            print(json.dumps(resp, ensure_ascii=False))
            sys.stdout.flush()

        except KeyboardInterrupt:
            break
        except Exception as e:
            # Unexpected error in the main loop — try to report and continue
            try:
                resp = {"id": None, "status": "error", "error": f"Runtime error: {e}"}
                print(json.dumps(resp, ensure_ascii=False))
                sys.stdout.flush()
            except Exception:
                pass
