CREATE TABLE "room_playback_states" (
	"room_id" text PRIMARY KEY NOT NULL,
	"active_stage_index" integer DEFAULT -1 NOT NULL,
	"active_member_id" text,
	"current_item_id" text,
	"current_song_id" integer,
	"current_song_name" varchar(160),
	"current_song_artists" varchar(240),
	"current_song_album_name" varchar(160),
	"current_song_cover_url" text,
	"current_song_duration_ms" integer,
	"status" varchar(16) DEFAULT 'idle' NOT NULL,
	"started_at" timestamp with time zone,
	"start_offset_ms" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_playback_states_status_check" CHECK ("room_playback_states"."status" in ('idle', 'playing')),
	CONSTRAINT "room_playback_states_start_offset_check" CHECK ("room_playback_states"."start_offset_ms" >= 0),
	CONSTRAINT "room_playback_states_version_check" CHECK ("room_playback_states"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_room_playlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"song_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"artists" varchar(240) NOT NULL,
	"album_name" varchar(160) NOT NULL,
	"cover_url" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_room_playlist_items_song_id_check" CHECK ("user_room_playlist_items"."song_id" > 0),
	CONSTRAINT "user_room_playlist_items_duration_check" CHECK ("user_room_playlist_items"."duration_ms" >= 0),
	CONSTRAINT "user_room_playlist_items_position_check" CHECK ("user_room_playlist_items"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "room_playback_states" ADD CONSTRAINT "room_playback_states_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_playback_states" ADD CONSTRAINT "room_playback_states_active_member_id_user_id_fk" FOREIGN KEY ("active_member_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_room_playlist_items" ADD CONSTRAINT "user_room_playlist_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_room_playlist_items_user_song_unique" ON "user_room_playlist_items" USING btree ("user_id","song_id");--> statement-breakpoint
CREATE INDEX "user_room_playlist_items_user_position_index" ON "user_room_playlist_items" USING btree ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "room_members_one_active_room_per_user" ON "room_members" USING btree ("user_id") WHERE "room_members"."left_at" is null;