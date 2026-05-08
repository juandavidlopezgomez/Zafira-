<?php
namespace BF;

use PDO;
use RuntimeException;

class Llamas {
    // ─── Razones de crédito (ganar LLAMAS) ──────────────────────────────────
    public const R_WELCOME            = 'welcome_bonus';        // +100 al registrarse
    public const R_DAILY_FIRST_GAME   = 'daily_first_game';     // +25 primera partida del día
    public const R_CHALLENGE_DONE     = 'challenge_completed';  // +10 reto completado
    public const R_MATCH_REVEALED     = 'match_revealed';       // +15 match mutuo revelado
    public const R_HILO_REACTION      = 'hilo_reaction';        // +5 reacción en Hilo
    public const R_RANK_UP            = 'rank_up';              // +50 al subir de rango
    public const R_REFERRAL           = 'referral_completed';   // +100 referido jugó su 1ra partida
    public const R_WEEKLY_CROWN_1     = 'weekly_crown_1';       // +1000 corona semanal #1
    public const R_WEEKLY_CROWN_2     = 'weekly_crown_2';       // +500 corona semanal #2
    public const R_WEEKLY_CROWN_3     = 'weekly_crown_3';       // +250 corona semanal #3
    public const R_TODO_NADA_WIN      = 'todo_nada_win';        // 2x apuesta si gana
    public const R_GAME_COMPLETED     = 'game_completed';       // +variable al finalizar partida

    // ─── Razones de débito (gastar LLAMAS) ──────────────────────────────────
    public const D_TODO_NADA_BET      = 'todo_nada_bet';        // -X apuesta
    public const D_HILO_SECRETO       = 'hilo_secreto';         // -50 activar Hilo Secreto
    public const D_SOBRE_ROJO         = 'sobre_rojo';           // -30 enviar Sobre Rojo
    public const D_MOMENTO_ESPECIAL   = 'momento_especial';     // -100 Momento Especial Arena
    public const D_RULETA_BOOST       = 'ruleta_boost';         // -25 girar ruleta extra

    // ─── Cantidades estandarizadas ──────────────────────────────────────────
    public const A_WELCOME          = 100;
    public const A_DAILY            = 25;
    public const A_CHALLENGE_DONE   = 10;
    public const A_MATCH_REVEALED   = 15;
    public const A_HILO_REACTION    = 5;
    public const A_RANK_UP          = 50;
    public const A_REFERRAL         = 100;
    public const A_HILO_SECRETO     = 50;
    public const A_SOBRE_ROJO       = 30;
    public const A_MOMENTO_ESPECIAL = 100;

    // ─── Balance derivado del ledger (siempre) ──────────────────────────────
    public static function balance(PDO $db, string $userId): int {
        $stmt = $db->prepare('SELECT COALESCE(SUM(amount), 0) FROM llamas_transactions WHERE user_id = ?');
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    }

    // ─── Crédito (suma) ─────────────────────────────────────────────────────
    public static function credit(
        PDO $db,
        string $userId,
        int $amount,
        string $reason,
        ?array $metadata = null,
        ?string $sessionId = null
    ): string {
        if ($amount <= 0) {
            throw new RuntimeException('Crédito requiere amount > 0');
        }
        return self::insertTx($db, $userId, abs($amount), 'credit', $reason, $metadata, $sessionId);
    }

    // ─── Débito (resta, valida balance suficiente) ──────────────────────────
    public static function debit(
        PDO $db,
        string $userId,
        int $amount,
        string $reason,
        ?array $metadata = null,
        ?string $sessionId = null
    ): string {
        if ($amount <= 0) {
            throw new RuntimeException('Débito requiere amount > 0');
        }
        $balance = self::balance($db, $userId);
        if ($balance < $amount) {
            throw new RuntimeException("Balance insuficiente: tienes $balance LLAMAS, necesitas $amount");
        }
        return self::insertTx($db, $userId, -abs($amount), 'debit', $reason, $metadata, $sessionId);
    }

    // ─── Bono diario: una vez por día por usuario ───────────────────────────
    public static function awardDailyIfNeeded(PDO $db, string $userId): bool {
        $stmt = $db->prepare(
            'SELECT 1 FROM llamas_transactions
             WHERE user_id = ? AND reason = ? AND DATE(created_at) = CURRENT_DATE LIMIT 1'
        );
        $stmt->execute([$userId, self::R_DAILY_FIRST_GAME]);
        if ($stmt->fetch()) return false;

        self::credit($db, $userId, self::A_DAILY, self::R_DAILY_FIRST_GAME);
        return true;
    }

    // ─── Helpers convenientes ───────────────────────────────────────────────
    public static function awardWelcome(PDO $db, string $userId): void {
        self::credit($db, $userId, self::A_WELCOME, self::R_WELCOME);
    }

    public static function awardChallengeCompleted(PDO $db, string $userId, ?string $sessionId = null): void {
        self::credit($db, $userId, self::A_CHALLENGE_DONE, self::R_CHALLENGE_DONE, null, $sessionId);
    }

    public static function awardMatchRevealed(PDO $db, string $userA, string $userB, string $roomId): void {
        self::credit($db, $userA, self::A_MATCH_REVEALED, self::R_MATCH_REVEALED, ['matched_with' => $userB], $roomId);
        self::credit($db, $userB, self::A_MATCH_REVEALED, self::R_MATCH_REVEALED, ['matched_with' => $userA], $roomId);
    }

    public static function awardHiloReaction(PDO $db, string $userId, string $messageId): void {
        self::credit($db, $userId, self::A_HILO_REACTION, self::R_HILO_REACTION, ['message_id' => $messageId]);
    }

    public static function awardRankUp(PDO $db, string $userId, int $newRank): void {
        self::credit($db, $userId, self::A_RANK_UP, self::R_RANK_UP, ['new_rank' => $newRank]);
    }

    public static function awardReferral(PDO $db, string $referrerId, string $referredId): void {
        self::credit($db, $referrerId, self::A_REFERRAL, self::R_REFERRAL, ['referred_id' => $referredId]);
    }

    public static function awardWeeklyCrown(PDO $db, string $userId, int $position): void {
        $amount = match ($position) { 1 => 1000, 2 => 500, 3 => 250, default => 0 };
        if ($amount === 0) return;
        $reason = ['1' => self::R_WEEKLY_CROWN_1, '2' => self::R_WEEKLY_CROWN_2, '3' => self::R_WEEKLY_CROWN_3][(string)$position];
        self::credit($db, $userId, $amount, $reason, ['position' => $position]);
    }

    // ─── Apuesta Todo-o-Nada: débito + payout 2x si gana ────────────────────
    public static function todoNadaBet(PDO $db, string $userId, int $amount, string $sessionId): string {
        return self::debit($db, $userId, $amount, self::D_TODO_NADA_BET, ['bet' => $amount], $sessionId);
    }

    public static function todoNadaWin(PDO $db, string $userId, int $amount, string $sessionId): void {
        self::credit($db, $userId, $amount * 2, self::R_TODO_NADA_WIN, ['payout' => $amount * 2], $sessionId);
    }

    // ─── Insert privado ─────────────────────────────────────────────────────
    private static function insertTx(
        PDO $db, string $userId, int $signedAmount, string $type,
        string $reason, ?array $metadata, ?string $sessionId
    ): string {
        $id = self::uuid();
        $db->prepare(
            'INSERT INTO llamas_transactions
             (id, user_id, amount, type, reason, metadata, session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id, $userId, $signedAmount, $type, $reason,
            $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE) : null,
            $sessionId,
        ]);
        return $id;
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }
}
