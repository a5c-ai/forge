export type GitTreeEntry = {
  mode: string;
  type: "blob" | "tree" | "commit";
  oid: string;
  path: string;
};

export interface IGit {
  revParse(treeish: string): Promise<string>;
  lsTree(commitOid: string, treePath: string): Promise<GitTreeEntry[]>;
  readBlob(commitOid: string, blobPath: string): Promise<Buffer>;
}


