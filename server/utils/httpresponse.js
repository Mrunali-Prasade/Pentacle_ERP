export class HttpResponse {
  static success(res, data, statusCode = 200) {
    return res.status(statusCode).json(data);
  }

  static error(res, message, statusCode = 500) {
    return res.status(statusCode).json({ error: message });
  }

  static unauthorized(res, message = 'Unauthorized') {
    return this.error(res, message, 401);
  }

  static forbidden(res, message = 'Forbidden: Insufficient permissions') {
    return this.error(res, message, 403);
  }

  static badRequest(res, message) {
    return this.error(res, message, 400);
  }
}
