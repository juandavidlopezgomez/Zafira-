-- ============================================================
-- BattleFlirt — Schema MySQL para Hostinger
-- Ejecutar en: Panel Hostinger > Bases de datos > phpMyAdmin
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `username`      VARCHAR(255)  NOT NULL,
  `email`         VARCHAR(255)  NOT NULL,
  `password_hash` VARCHAR(255)  NOT NULL,
  `avatar_url`    VARCHAR(255)  DEFAULT NULL,
  `age`           INT           DEFAULT NULL,
  `is_premium`    TINYINT(1)   NOT NULL DEFAULT 0,
  `charisma_pts`  INT           NOT NULL DEFAULT 0,
  `referral_code` VARCHAR(255)  DEFAULT NULL,
  `created_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_users_username` (`username`),
  UNIQUE KEY `UQ_users_email` (`email`),
  UNIQUE KEY `UQ_users_referral_code` (`referral_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── rooms ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rooms` (
  `id`          VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `code`        VARCHAR(8)    NOT NULL,
  `host_id`     VARCHAR(36)   NOT NULL,
  `mode`        VARCHAR(32)   NOT NULL,
  `status`      VARCHAR(16)   NOT NULL DEFAULT 'waiting',
  `max_players` INT           NOT NULL DEFAULT 12,
  `is_premium`  TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_rooms_code` (`code`),
  KEY `FK_rooms_host_id` (`host_id`),
  CONSTRAINT `FK_rooms_host_id` FOREIGN KEY (`host_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── llamas_transactions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `llamas_transactions` (
  `id`         VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  `user_id`    VARCHAR(36)  NOT NULL,
  `amount`     INT          NOT NULL,
  `reason`     VARCHAR(64)  NOT NULL,
  `session_id` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `FK_llamas_user_id` (`user_id`),
  CONSTRAINT `FK_llamas_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── premium_subscriptions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `premium_subscriptions` (
  `id`                  VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  `user_id`             VARCHAR(36)  NOT NULL,
  `stripe_sub_id`       VARCHAR(255) DEFAULT NULL,
  `status`              VARCHAR(16)  NOT NULL DEFAULT 'active',
  `plan`                VARCHAR(16)  NOT NULL,
  `current_period_end`  DATETIME     DEFAULT NULL,
  `created_at`          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_premium_stripe_sub_id` (`stripe_sub_id`),
  KEY `FK_premium_user_id` (`user_id`),
  CONSTRAINT `FK_premium_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── arena_stadiums ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `arena_stadiums` (
  `id`         VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  `room_id`    VARCHAR(36)  NOT NULL,
  `feature`    VARCHAR(32)  NOT NULL,
  `status`     VARCHAR(16)  NOT NULL DEFAULT 'pending',
  `started_at` DATETIME     DEFAULT NULL,
  `ended_at`   DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── arena_events ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `arena_events` (
  `id`          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  `stadium_id`  VARCHAR(36)  NOT NULL,
  `event_type`  VARCHAR(32)  NOT NULL,
  `payload`     JSON         NOT NULL DEFAULT (JSON_OBJECT()),
  `created_at`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `FK_arena_events_stadium_id` (`stadium_id`),
  CONSTRAINT `FK_arena_events_stadium_id` FOREIGN KEY (`stadium_id`) REFERENCES `arena_stadiums` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── arena_votes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `arena_votes` (
  `id`          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  `stadium_id`  VARCHAR(36)  NOT NULL,
  `voter_id`    VARCHAR(36)  NOT NULL,
  `target_id`   VARCHAR(255) DEFAULT NULL,
  `vote_type`   VARCHAR(32)  NOT NULL,
  `created_at`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── room_players (reemplaza Redis hset) ─────────────────────
CREATE TABLE IF NOT EXISTS `room_players` (
  `room_id`    VARCHAR(36)   NOT NULL,
  `user_id`    VARCHAR(36)   NOT NULL,
  `username`   VARCHAR(255)  NOT NULL,
  `joined_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_id`, `user_id`),
  KEY `FK_rp_room` (`room_id`),
  KEY `FK_rp_user` (`user_id`),
  CONSTRAINT `FK_rp_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_rp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── game_events (cola de polling) ───────────────────────────
CREATE TABLE IF NOT EXISTS `game_events` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `room_id`        VARCHAR(36)   NOT NULL,
  `event_type`     VARCHAR(64)   NOT NULL,
  `payload`        JSON          NOT NULL DEFAULT (JSON_OBJECT()),
  `target_user_id` VARCHAR(36)   DEFAULT NULL,
  `created_at`     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_ge_room_id` (`room_id`, `id`),
  KEY `idx_ge_target`  (`target_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── game_state (reemplaza Redis key-value) ───────────────────
CREATE TABLE IF NOT EXISTS `game_state` (
  `room_id`     VARCHAR(36)   NOT NULL,
  `state_key`   VARCHAR(128)  NOT NULL,
  `state_value` MEDIUMTEXT    NOT NULL,
  `expires_at`  DATETIME      DEFAULT NULL,
  PRIMARY KEY (`room_id`, `state_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── hilo_messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `hilo_messages` (
  `id`         VARCHAR(36)   NOT NULL,
  `seq`        BIGINT        NOT NULL AUTO_INCREMENT,
  `room_id`    VARCHAR(36)   NOT NULL,
  `user_id`    VARCHAR(36)   DEFAULT NULL,
  `alias_id`   VARCHAR(32)   DEFAULT NULL,
  `username`   VARCHAR(255)  DEFAULT NULL,
  `content`    TEXT          NOT NULL,
  `tension`    TINYINT       NOT NULL DEFAULT 0,
  `created_at` DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_hilo_seq` (`seq`),
  KEY `idx_hilo_room` (`room_id`, `seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── hilo_reactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `hilo_reactions` (
  `message_id` VARCHAR(36)  NOT NULL,
  `user_id`    VARCHAR(36)  NOT NULL,
  `reaction`   VARCHAR(8)   NOT NULL,
  PRIMARY KEY (`message_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
