export type {
  ConfigureOptions,
  DefineHandlersReturn,
  HandlerResult,
  ScheduleParams,
  UpdateHandler,
} from "./server/types";

export { configure, defineHandlers, setCollections } from "./server/runtime";

export const name = "scheduled-collection-updates";
