export type AggoPageElement = {
  id: string;
  tagName: string;
  attributes?: Record<string, any>;
  styles?: Record<string, any>;
  content?: any;
  children?: AggoPageElement[];

  /** Optional event mapping (preferred over attributes). Keys are event names like 'click', 'change'. Values are handler ids. */
  events?: Record<string, string>;

  /** Optional lifecycle mapping. Values are handler ids. */
  lifecycle?: {
    onMount?: string;
    onUnmount?: string;
  };
};

export type AggoEventName =
  | 'click'
  | 'change'
  | 'input'
  | 'submit'
  | 'keydown'
  | 'keyup'
  | 'focus'
  | 'blur';

export type AggoHandlerContext = {
  pageId?: string;
  elementId: string;
  element: AggoPageElement;
  eventName: AggoEventName;
  event?: unknown;
  store: AggoStore;
  emit: (eventName: string, payload: unknown) => void;
};

export type AggoHandler = (ctx: AggoHandlerContext) => void | Promise<void>;

export type AggoHandlers = Record<string, AggoHandler>;

export type AggoStore = {
  getState: () => any;
  setState: (next: any) => void;
  updateState: (patch: any) => void;
  subscribe: (listener: () => void) => () => void;
};
