<?php
namespace BF;

class Response {
    public static function json(mixed $data, int $status = 200): void {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function ok(mixed $data = null): void {
        self::json(['success' => true, 'data' => $data]);
    }

    public static function error(string $message, int $status = 400): void {
        self::json(['success' => false, 'error' => $message], $status);
    }
}
