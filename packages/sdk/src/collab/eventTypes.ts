export type A5cEventBase = {
  schema: "a5cforge/v1";
  kind: string;
  id: string;
  time: string;
  actor: string;
  payload: Record<string, any>;
};

export type ParsedEventFile = {
  path: string;
  kind: string;
  event: A5cEventBase;
};


