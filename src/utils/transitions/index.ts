import { getTransitionDefinition } from "./transitionCatalog";
export {
  TRANSITION_CATEGORIES,
  getTransitionDefinition,
} from "./transitionCatalog";
export type {
  TransitionCategory,
  TransitionParamSpec,
  TransitionCssOutput,
  TransitionDefinition,
  TransitionCategoryDef,
} from "./transitionCatalog";

export const buildTransitionCss = (
  transition: Cut.TransitionConfig | undefined,
  progress: number,
): {
  outgoingStyle: React.CSSProperties;
  incomingStyle: React.CSSProperties;
} => {
  const defaultResult = {
    outgoingStyle: {},
    incomingStyle: {},
  };
  if (!transition) return defaultResult;

  const def = getTransitionDefinition(transition.type);
  if (!def) return defaultResult;

  const params = transition.params as Record<string, number>;
  const result = def.cssBuilder(progress, params);

  return {
    outgoingStyle: result.outgoingStyle ?? {},
    incomingStyle: result.incomingStyle ?? {},
  };
};
