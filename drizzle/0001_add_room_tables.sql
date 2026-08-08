CREATE TABLE "rooms" (
  "id" text PRIMARY KEY NOT NULL,
  "code" varchar(32) NOT NULL,
  "name" varchar(20) NOT NULL,
  "tag" varchar(12) NOT NULL,
  "password_hash" text,
  "owner_id" text NOT NULL,
  "max_members" smallint NOT NULL,
  "max_stage_members" smallint NOT NULL,
  "current_member_count" smallint DEFAULT 0 NOT NULL,
  "last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
  "empty_expires_at" timestamp with time zone DEFAULT now() + interval '30 minutes' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "rooms_code_unique" UNIQUE("code"),
  CONSTRAINT "rooms_name_length_check"
    CHECK (char_length(trim("rooms"."name")) between 2 and 20),
  CONSTRAINT "rooms_tag_length_check"
    CHECK (char_length(trim("rooms"."tag")) between 2 and 12),
  CONSTRAINT "rooms_max_members_check"
    CHECK ("rooms"."max_members" between 2 and 50),
  CONSTRAINT "rooms_max_stage_members_check"
    CHECK ("rooms"."max_stage_members" between 1 and 30),
  CONSTRAINT "rooms_current_member_count_check"
    CHECK ("rooms"."current_member_count" between 0 and "rooms"."max_members")
);

--> statement-breakpoint

CREATE TABLE "room_members" (
  "room_id" text NOT NULL,
  "user_id" text NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "left_at" timestamp with time zone,

  CONSTRAINT "room_members_pkey" PRIMARY KEY("room_id", "user_id")
);

--> statement-breakpoint

CREATE TABLE "room_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "room_id" text NOT NULL,
  "user_id" text NOT NULL,
  "content" varchar(120) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "room_messages_content_length_check"
    CHECK (char_length(trim("room_messages"."content")) between 1 and 120)
);

--> statement-breakpoint

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_owner_id_user_id_fk"
  FOREIGN KEY ("owner_id")
  REFERENCES "public"."user"("id")
  ON DELETE CASCADE;

--> statement-breakpoint

ALTER TABLE "room_members"
  ADD CONSTRAINT "room_members_room_id_rooms_id_fk"
  FOREIGN KEY ("room_id")
  REFERENCES "public"."rooms"("id")
  ON DELETE CASCADE;

--> statement-breakpoint

ALTER TABLE "room_members"
  ADD CONSTRAINT "room_members_user_id_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."user"("id")
  ON DELETE CASCADE;

--> statement-breakpoint

ALTER TABLE "room_messages"
  ADD CONSTRAINT "room_messages_room_id_rooms_id_fk"
  FOREIGN KEY ("room_id")
  REFERENCES "public"."rooms"("id")
  ON DELETE CASCADE;

--> statement-breakpoint

ALTER TABLE "room_messages"
  ADD CONSTRAINT "room_messages_user_id_user_id_fk"
  FOREIGN KEY ("user_id")
  REFERENCES "public"."user"("id")
  ON DELETE CASCADE;

--> statement-breakpoint

CREATE INDEX "rooms_last_active_index"
  ON "rooms" USING btree ("last_active_at");

--> statement-breakpoint

CREATE INDEX "room_members_room_left_joined_index"
  ON "room_members" USING btree ("room_id", "left_at", "joined_at");

--> statement-breakpoint

CREATE INDEX "room_messages_room_created_index"
  ON "room_messages" USING btree ("room_id", "created_at");