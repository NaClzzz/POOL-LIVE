import { relations } from "drizzle-orm/relations";
import { user, session, account, likedSongs } from "./schema";

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	sessions: many(session),
	accounts: many(account),
	likedSongs: many(likedSongs),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const likedSongsRelations = relations(likedSongs, ({one}) => ({
	user: one(user, {
		fields: [likedSongs.userId],
		references: [user.id]
	}),
}));