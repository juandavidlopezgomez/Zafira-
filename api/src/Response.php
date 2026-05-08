<?php
namespace BF;

class Response {
    public static function json(mixed $data, int $status = 200): never {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function ok(mixed $data = null): never {
        self::json(['success' => true, 'data' => $data]);
    }

    public static function error(string $message, int $status = 400): never {
        self::json(['success' => false, 'error' => $message], $status);
    }
}
