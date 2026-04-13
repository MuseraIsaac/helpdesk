export interface Note {
  id: number;
  body: string;
  bodyHtml: string | null;
  isPinned: boolean;
  authorId: string;
  author: { id: string; name: string };
  /** Future: IDs of agents @mentioned in this note */
  mentionedUserIds: string[];
  createdAt: string;
  updatedAt: string;
}
