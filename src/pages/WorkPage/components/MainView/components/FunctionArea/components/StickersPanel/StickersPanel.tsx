import React, { useCallback, useMemo, useState } from "react";
import { Input, Tabs } from "antd";
import { useI18n, useSdk } from "hooks";
import { editorStore, playbackStore } from "reducers";
import { getTimelineEnd, setOverlayPayload } from "utils";
import styles from "./StickersPanel.less";

interface StickerCategory {
  id: string;
  nameKey: string;
  stickers: string[];
}

const STICKER_CATEGORIES: StickerCategory[] = [
  {
    id: "smileys",
    nameKey: "cut.stickers.categorySmileys",
    stickers: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "🙃",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "🤩",
      "😘",
      "😗",
      "😚",
      "😙",
      "😋",
      "😛",
      "😜",
      "🤪",
      "😝",
      "🤑",
      "🤗",
      "🤭",
      "🤫",
      "🤔",
      "😎",
      "🥸",
      "🤓",
      "🧐",
      "😏",
      "😒",
      "🙄",
      "😬",
      "😮‍💨",
      "🤥",
      "😌",
      "😔",
      "😪",
      "🤤",
      "😴",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
    ],
  },
  {
    id: "gestures",
    nameKey: "cut.stickers.categoryGestures",
    stickers: [
      "👍",
      "👎",
      "👌",
      "🤌",
      "🤏",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "🤙",
      "👈",
      "👉",
      "👆",
      "👇",
      "☝️",
      "👋",
      "🤚",
      "🖐️",
      "✋",
      "🖖",
      "👏",
      "🙌",
      "👐",
      "🤲",
      "🤝",
      "🙏",
      "✍️",
      "💪",
      "🦾",
      "🦿",
    ],
  },
  {
    id: "animals",
    nameKey: "cut.stickers.categoryAnimals",
    stickers: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🐔",
      "🐧",
      "🐦",
      "🐤",
      "🦆",
      "🦅",
      "🦉",
      "🦇",
      "🐺",
      "🐗",
      "🐴",
      "🦄",
      "🐝",
      "🐛",
      "🦋",
      "🐌",
      "🐞",
      "🐜",
      "🦗",
      "🕷️",
      "🦂",
      "🐢",
      "🐍",
      "🦎",
      "🦖",
    ],
  },
  {
    id: "food",
    nameKey: "cut.stickers.categoryFood",
    stickers: [
      "🍎",
      "🍐",
      "🍊",
      "🍋",
      "🍌",
      "🍉",
      "🍇",
      "🍓",
      "🫐",
      "🍈",
      "🍒",
      "🍑",
      "🥭",
      "🍍",
      "🥥",
      "🥝",
      "🍅",
      "🍆",
      "🥑",
      "🥦",
      "🍔",
      "🍟",
      "🍕",
      "🌭",
      "🥪",
      "🌮",
      "🌯",
      "🥙",
      "🍳",
      "🥘",
      "🍜",
      "🍝",
      "🍣",
      "🍱",
      "🍚",
      "🍛",
      "🍩",
      "🍪",
      "🎂",
      "🍰",
    ],
  },
  {
    id: "activities",
    nameKey: "cut.stickers.categoryActivities",
    stickers: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🥎",
      "🎾",
      "🏐",
      "🏉",
      "🥏",
      "🎱",
      "🏓",
      "🏸",
      "🏒",
      "🏑",
      "🥍",
      "🏏",
      "🥅",
      "⛳",
      "🏹",
      "🎣",
      "🥊",
      "🥋",
      "🎽",
      "⛸️",
      "🥌",
      "🛷",
      "🎿",
      "⛷️",
      "🏂",
      "🪂",
    ],
  },
  {
    id: "travel",
    nameKey: "cut.stickers.categoryTravel",
    stickers: [
      "🚗",
      "🚕",
      "🚙",
      "🚌",
      "🚎",
      "🏎️",
      "🚓",
      "🚑",
      "🚒",
      "🚐",
      "🚚",
      "🚛",
      "🚜",
      "🛵",
      "🏍️",
      "🚲",
      "🛴",
      "✈️",
      "🚀",
      "🛸",
      "🚁",
      "⛵",
      "🚤",
      "🛳️",
      "⛴️",
      "🚢",
      "🗺️",
      "🗽",
      "🗼",
      "🏰",
    ],
  },
  {
    id: "symbols",
    nameKey: "cut.stickers.categorySymbols",
    stickers: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "💟",
      "♥️",
      "⭐",
      "🌟",
      "✨",
      "⚡",
      "🔥",
      "💥",
      "💫",
      "☀️",
      "🌙",
      "⛅",
      "🎉",
      "🎊",
      "🎈",
      "🎁",
      "🏆",
      "🥇",
      "🥈",
      "🥉",
      "👑",
      "💎",
    ],
  },
  {
    id: "nature",
    nameKey: "cut.stickers.categoryNature",
    stickers: [
      "🌸",
      "🌺",
      "🌻",
      "🌹",
      "🌷",
      "💐",
      "🌵",
      "🎄",
      "🌲",
      "🌳",
      "🌴",
      "🌱",
      "🍀",
      "🌿",
      "☘️",
      "🍁",
      "🍂",
      "🍃",
      "🌾",
      "🌊",
      "🌈",
      "☀️",
      "🌤️",
      "⛅",
      "🌥️",
      "☁️",
      "🌦️",
      "🌧️",
      "⛈️",
      "🌩️",
      "🌨️",
      "❄️",
      "☃️",
      "⛄",
      "🌬️",
      "💨",
      "🌪️",
      "🌫️",
      "🌊",
      "💧",
    ],
  },
  {
    id: "objects",
    nameKey: "cut.stickers.categoryObjects",
    stickers: [
      "💻",
      "📱",
      "⌚",
      "⌨️",
      "🖥️",
      "🖨️",
      "🖱️",
      "💿",
      "📷",
      "📹",
      "🎥",
      "📺",
      "📻",
      "🎙️",
      "🎚️",
      "🎛️",
      "🔋",
      "🔌",
      "💡",
      "🔦",
      "🕯️",
      "📚",
      "📖",
      "📓",
      "📔",
      "📒",
      "📕",
      "📗",
      "📘",
      "📙",
      "✏️",
      "📝",
      "🖊️",
      "🖋️",
      "✒️",
      "📎",
      "📌",
      "📐",
      "📍",
      "📌",
    ],
  },
  {
    id: "faces",
    nameKey: "cut.stickers.categoryFaces",
    stickers: [
      "😀",
      "😂",
      "🥹",
      "😍",
      "🤩",
      "😘",
      "😎",
      "🤔",
      "😴",
      "🤯",
      "🥳",
      "😇",
      "🤠",
      "🥸",
      "🤓",
      "😏",
      "😒",
      "🙄",
      "😬",
      "🤥",
      "😌",
      "😔",
      "😪",
      "🤤",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
      "🥴",
      "😵",
      "🤯",
      "🤠",
      "🥳",
      "🥺",
      "😢",
      "😭",
      "😤",
      "😠",
      "😡",
    ],
  },
];

const StickersPanel: React.FC = () => {
  const sdk = useSdk();
  const { text } = useI18n();
  const [keyword, setKeyword] = useState("");

  const handleAdd = useCallback(
    (emoji: string) => {
      const clipId = editorStore.addOverlayClip({
        type: "sticker",
        sticker: {
          content: emoji,
          stickerType: "emoji",
          size: 96,
        },
      });
      if (clipId) {
        const project = editorStore.getState().project;
        if (project) {
          playbackStore.setDuration(getTimelineEnd(project.tracks));
        }
        sdk.ui.toast.success(text("cut.stickers.added"));
      } else {
        sdk.ui.toast.warn(text("cut.timeline.empty"));
      }
    },
    [sdk, text],
  );

  const handleDragStart = useCallback((e: React.DragEvent, emoji: string) => {
    setOverlayPayload(e, {
      kind: "sticker",
      preset: {
        content: emoji,
        stickerType: "emoji",
        size: 96,
      },
    });
  }, []);

  const tabItems = useMemo(
    () =>
      STICKER_CATEGORIES.map((category) => ({
        key: category.id,
        label: text(category.nameKey),
        children: (
          <div className={styles.grid}>
            {category.stickers
              .filter((emoji) => !keyword || emoji.includes(keyword))
              .map((emoji) => (
                <div
                  key={emoji}
                  className={styles.cell}
                  draggable
                  onDragStart={(e) => handleDragStart(e, emoji)}
                  onClick={() => handleAdd(emoji)}
                  role="button"
                  tabIndex={0}
                >
                  <span className={styles.emoji}>{emoji}</span>
                </div>
              ))}
          </div>
        ),
      })),
    [keyword, text, handleAdd, handleDragStart],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.hint}>{text("cut.stickers.hint")}</div>
      <div className={styles.search}>
        <Input.Search
          size="small"
          allowClear
          placeholder={text("cut.stickers.searchPlaceholder")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <Tabs
        className={styles.tabs}
        defaultActiveKey={STICKER_CATEGORIES[0].id}
        items={tabItems}
        size="small"
        tabPosition="left"
      />
    </div>
  );
};

export default StickersPanel;
