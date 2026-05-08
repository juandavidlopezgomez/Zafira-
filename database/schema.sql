-- ============================================================
-- BattleFlirt — Schema completo (27 tablas)
-- Compatible MySQL 5.7+ / MariaDB 10.3+ (Hostinger)
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── 1. users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`                    VARCHAR(36)   NOT NULL,
  `username`              VARCHAR(50)   NOT NULL,
  `email`                 VARCHAR(255)  NOT NULL,
  `password_hash`         VARCHAR(255)  NOT NULL,
  `avatar_url`            VARCHAR(500)  DEFAULT NULL,
  `age`                   INT           DEFAULT NULL,
  `age_verified`          TINYINT(1)    NOT NULL DEFAULT 0,
  `is_premium`            TINYINT(1)    NOT NULL DEFAULT 0,
  `premium_expires_at`    DATETIME      DEFAULT NULL,
  `grace_period_ends_at`  DATETIME      DEFAULT NULL,
  `stripe_customer_id`    VARCHAR(255)  DEFAULT NULL,
  `referral_code`         VARCHAR(20)   DEFAULT NULL,
  `referred_by`           VARCHAR(36)   DEFAULT NULL,
  `charisma_points`       INT           NOT NULL DEFAULT 0,
  `current_rank`          INT           NOT NULL DEFAULT 1,
  `last_seen_at`          DATETIME      DEFAULT NULL,
  `created_at`            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_users_username` (`username`),
  UNIQUE KEY `UQ_users_email` (`email`),
  UNIQUE KEY `UQ_users_referral_code` (`referral_code`),
  UNIQUE KEY `UQ_users_stripe_customer` (`stripe_customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. rooms ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rooms` (
  `id`          VARCHAR(36)   NOT NULL,
  `code`        VARCHAR(10)   NOT NULL,
  `host_id`     VARCHAR(36)   NOT NULL,
  `mode`        VARCHAR(50)   DEFAULT NULL,
  `status`      VARCHAR(20)   NOT NULL DEFAULT 'waiting',
  `max_players` INT           NOT NULL DEFAULT 8,
  `is_private`  TINYINT(1)    NOT NULL DEFAULT 0,
  `is_premium`  TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at`  DATETIME      DEFAULT NULL,
  `ended_at`    DATETIME      DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_rooms_code` (`code`),
  KEY `idx_rooms_host` (`host_id`),
  KEY `idx_rooms_status` (`status`),
  CONSTRAINT `FK_rooms_host_id` FOREIGN KEY (`host_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. room_players ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `room_players` (
  `room_id`    VARCHAR(36)   NOT NULL,
  `user_id`    VARCHAR(36)   NOT NULL,
  `username`   VARCHAR(50)   NOT NULL,
  `score`      INT           NOT NULL DEFAULT 0,
  `joined_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `left_at`    DATETIME      DEFAULT NULL,
  PRIMARY KEY (`room_id`, `user_id`),
  KEY `idx_rp_user` (`user_id`),
  CONSTRAINT `FK_rp_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_rp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. game_sessions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `game_sessions` (
  `id`         VARCHAR(36)  NOT NULL,
  `room_id`    VARCHAR(36)  NOT NULL,
  `mode`       VARCHAR(50)  NOT NULL,
  `started_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at`   DATETIME     DEFAULT NULL,
  `metadata`   LONGTEXT     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_gs_room` (`room_id`),
  CONSTRAINT `FK_gs_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5. game_events (cola de polling) ────────────────────────
CREATE TABLE IF NOT EXISTS `game_events` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `room_id`        VARCHAR(36)   NOT NULL,
  `event_type`     VARCHAR(64)   NOT NULL,
  `payload`        LONGTEXT      NOT NULL,
  `target_user_id` VARCHAR(36)   DEFAULT NULL,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ge_room` (`room_id`, `id`),
  KEY `idx_ge_target` (`target_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6. game_state (key-value transitorio) ───────────────────
CREATE TABLE IF NOT EXISTS `game_state` (
  `room_id`     VARCHAR(36)   NOT NULL,
  `state_key`   VARCHAR(128)  NOT NULL,
  `state_value` MEDIUMTEXT    NOT NULL,
  `expires_at`  DATETIME      DEFAULT NULL,
  PRIMARY KEY (`room_id`, `state_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 7. interest_matches (matches reveal-only) ───────────────
CREATE TABLE IF NOT EXISTS `interest_matches` (
  `id`          VARCHAR(36)  NOT NULL,
  `room_id`     VARCHAR(36)  NOT NULL,
  `user_a_id`   VARCHAR(36)  NOT NULL,
  `user_b_id`   VARCHAR(36)  NOT NULL,
  `revealed_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_match_pair` (`room_id`, `user_a_id`, `user_b_id`),
  KEY `idx_im_user_a` (`user_a_id`),
  KEY `idx_im_user_b` (`user_b_id`),
  CONSTRAINT `FK_im_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 8. charisma_events ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `charisma_events` (
  `id`         VARCHAR(36)  NOT NULL,
  `user_id`    VARCHAR(36)  NOT NULL,
  `points`     INT          NOT NULL,
  `reason`     VARCHAR(100) NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ce_user` (`user_id`),
  KEY `idx_ce_created` (`created_at`),
  CONSTRAINT `FK_ce_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 9. charisma_ranks (historial subidas de rango) ──────────
CREATE TABLE IF NOT EXISTS `charisma_ranks` (
  `id`         VARCHAR(36)  NOT NULL,
  `user_id`    VARCHAR(36)  NOT NULL,
  `old_rank`   INT          NOT NULL,
  `new_rank`   INT          NOT NULL,
  `changed_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cr_user` (`user_id`),
  CONSTRAINT `FK_cr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 10. badges (insignias) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `badges` (
  `id`         VARCHAR(36)  NOT NULL,
  `user_id`    VARCHAR(36)  NOT NULL,
  `badge_type` VARCHAR(50)  NOT NULL,
  `earned_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_user_badge` (`user_id`, `badge_type`),
  CONSTRAINT `FK_badges_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 11. referrals ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `referrals` (
  `id`           VARCHAR(36)  NOT NULL,
  `referrer_id`  VARCHAR(36)  NOT NULL,
  `referred_id`  VARCHAR(36)  NOT NULL,
  `rewarded_at`  DATETIME     DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_referred` (`referred_id`),
  KEY `idx_ref_referrer` (`referrer_id`),
  CONSTRAINT `FK_ref_referrer` FOREIGN KEY (`referrer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `FK_ref_referred` FOREIGN KEY (`referred_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 12. llamas_transactions (ledger append-only) ────────────
CREATE TABLE IF NOT EXISTS `llamas_transactions` (
  `id`         VARCHAR(36)  NOT NULL,
  `user_id`    VARCHAR(36)  NOT NULL,
  `amount`     INT          NOT NULL,
  `type`       VARCHAR(20)  NOT NULL DEFAULT 'credit',
  `reason`     VARCHAR(100) NOT NULL,
  `metadata`   LONGTEXT     DEFAULT NULL,
  `session_id` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lt_user` (`user_id`),
  KEY `idx_lt_created` (`created_at`),
  CONSTRAINT `FK_lt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 13. challenges (pool de retos) ──────────────────────────
CREATE TABLE IF NOT EXISTS `challenges` (
  `id`         VARCHAR(36)  NOT NULL,
  `type`       VARCHAR(20)  NOT NULL,
  `intensity`  INT          NOT NULL DEFAULT 1,
  `tags`       VARCHAR(255) DEFAULT NULL,
  `text`       TEXT         NOT NULL,
  `source`     VARCHAR(20)  NOT NULL DEFAULT 'manual',
  `active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `uses_count` INT          NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ch_type_intensity` (`type`, `intensity`, `active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 14. dark_challenges (Premium 18+) ───────────────────────
CREATE TABLE IF NOT EXISTS `dark_challenges` (
  `id`         VARCHAR(36)  NOT NULL,
  `intensity`  INT          NOT NULL DEFAULT 4,
  `tags`       VARCHAR(255) DEFAULT NULL,
  `text`       TEXT         NOT NULL,
  `min_age`    INT          NOT NULL DEFAULT 18,
  `active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dc_intensity` (`intensity`, `active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 15. arena_stadiums ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `arena_stadiums` (
  `id`           VARCHAR(36)  NOT NULL,
  `name`         VARCHAR(100) NOT NULL DEFAULT 'Estadio',
  `room_id`      VARCHAR(36)  DEFAULT NULL,
  `host_id`      VARCHAR(36)  DEFAULT NULL,
  `feature`      VARCHAR(32)  DEFAULT NULL,
  `max_players`  INT          NOT NULL DEFAULT 50,
  `status`       VARCHAR(20)  NOT NULL DEFAULT 'open',
  `started_at`   DATETIME     DEFAULT NULL,
  `ended_at`     DATETIME     DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_as_host` (`host_id`),
  KEY `idx_as_room` (`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 16. arena_events ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `arena_events` (
  `id`           VARCHAR(36)  NOT NULL,
  `stadium_id`   VARCHAR(36)  NOT NULL,
  `event_type`   VARCHAR(50)  NOT NULL,
  `initiated_by` VARCHAR(36)  DEFAULT NULL,
  `payload`      LONGTEXT     NOT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ae_stadium` (`stadium_id`),
  CONSTRAINT `FK_ae_stadium` FOREIGN KEY (`stadium_id`) REFERENCES `arena_stadiums` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 17. arena_votes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `arena_votes` (
  `id`         VARCHAR(36)  NOT NULL,
  `stadium_id` VARCHAR(36)  NOT NULL,
  `event_id`   VARCHAR(36)  DEFAULT NULL,
  `voter_id`   VARCHAR(36)  NOT NULL,
  `target_id`  VARCHAR(255) DEFAULT NULL,
  `vote_type`  VARCHAR(32)  NOT NULL,
  `value`      INT          DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_vote_per_event` (`event_id`, `voter_id`),
  KEY `idx_av_stadium` (`stadium_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 18. epic_moments ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `epic_moments` (
  `id`           VARCHAR(36)  NOT NULL,
  `stadium_id`   VARCHAR(36)  NOT NULL,
  `nominated_by` VARCHAR(36)  NOT NULL,
  `description`  TEXT         NOT NULL,
  `vote_count`   INT          NOT NULL DEFAULT 0,
  `confirmed`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_em_stadium` (`stadium_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 19. hilos (instancias) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `hilos` (
  `id`         VARCHAR(36)  NOT NULL,
  `room_id`    VARCHAR(36)  NOT NULL,
  `type`       VARCHAR(20)  NOT NULL DEFAULT 'directo',
  `status`     VARCHAR(20)  NOT NULL DEFAULT 'active',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at`   DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_hilos_room` (`room_id`),
  CONSTRAINT `FK_hilos_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 20. hilo_messages ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `hilo_messages` (
  `id`              VARCHAR(36)   NOT NULL,
  `seq`             BIGINT        NOT NULL AUTO_INCREMENT,
  `hilo_id`         VARCHAR(36)   DEFAULT NULL,
  `room_id`         VARCHAR(36)   NOT NULL,
  `user_id`         VARCHAR(36)   DEFAULT NULL,
  `alias_id`        VARCHAR(50)   DEFAULT NULL,
  `username`        VARCHAR(50)   DEFAULT NULL,
  `content`         TEXT          NOT NULL,
  `tension`         TINYINT       NOT NULL DEFAULT 0,
  `tension_at_send` INT           NOT NULL DEFAULT 0,
  `level_at_send`   INT           NOT NULL DEFAULT 1,
  `expires_at`      DATETIME      DEFAULT NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_hilo_seq` (`seq`),
  KEY `idx_hm_room` (`room_id`, `seq`),
  KEY `idx_hm_hilo` (`hilo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 21. hilo_reactions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `hilo_reactions` (
  `message_id` VARCHAR(36)  NOT NULL,
  `user_id`    VARCHAR(36)  NOT NULL,
  `reaction`   VARCHAR(8)   NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 22. hilo_tension_history (snapshots) ────────────────────
CREATE TABLE IF NOT EXISTS `hilo_tension_history` (
  `id`          VARCHAR(36)  NOT NULL,
  `hilo_id`     VARCHAR(36)  DEFAULT NULL,
  `room_id`     VARCHAR(36)  NOT NULL,
  `tension`     INT          NOT NULL,
  `level`       INT          NOT NULL,
  `recorded_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hth_room` (`room_id`, `recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 23. hilo_confessions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `hilo_confessions` (
  `id`           VARCHAR(36)  NOT NULL,
  `hilo_id`      VARCHAR(36)  DEFAULT NULL,
  `room_id`      VARCHAR(36)  NOT NULL,
  `confessor_id` VARCHAR(36)  NOT NULL,
  `text`         TEXT         NOT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hc_room` (`room_id`),
  KEY `idx_hc_user` (`confessor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 24. premium_subscriptions ───────────────────────────────
CREATE TABLE IF NOT EXISTS `premium_subscriptions` (
  `id`                     VARCHAR(36)  NOT NULL,
  `user_id`                VARCHAR(36)  NOT NULL,
  `stripe_subscription_id` VARCHAR(255) DEFAULT NULL,
  `status`                 VARCHAR(20)  NOT NULL DEFAULT 'active',
  `plan`                   VARCHAR(20)  NOT NULL DEFAULT 'monthly',
  `current_period_end`     DATETIME     DEFAULT NULL,
  `grace_period_end`       DATETIME     DEFAULT NULL,
  `created_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_premium_user` (`user_id`),
  UNIQUE KEY `UQ_premium_stripe` (`stripe_subscription_id`),
  CONSTRAINT `FK_ps_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 25. moderation_logs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `moderation_logs` (
  `id`         VARCHAR(36)  NOT NULL,
  `user_id`    VARCHAR(36)  DEFAULT NULL,
  `room_id`    VARCHAR(36)  DEFAULT NULL,
  `content`    TEXT         NOT NULL,
  `categories` LONGTEXT     DEFAULT NULL,
  `action`     VARCHAR(20)  NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ml_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 26. beta_codes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `beta_codes` (
  `id`         VARCHAR(36)  NOT NULL,
  `code`       VARCHAR(20)  NOT NULL,
  `used_by`    VARCHAR(36)  DEFAULT NULL,
  `used_at`    DATETIME     DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_beta_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 27. push_subscriptions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id`         VARCHAR(36)  NOT NULL,
  `user_id`    VARCHAR(36)  NOT NULL,
  `endpoint`   TEXT         NOT NULL,
  `p256dh`     TEXT         NOT NULL,
  `auth`       TEXT         NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_push_user` (`user_id`),
  CONSTRAINT `FK_push_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
