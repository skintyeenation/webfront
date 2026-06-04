// Global exception filter — logs every failure with route + status +
// stack so a 500 in the Container App stream is never silent. NestJS'
// BaseExceptionFilter logs unhandled errors at error level by default
// but HttpExceptions (4xx) are silent, and the default record doesn't
// include the request path — both of which made debugging the
// staff-auth 500 harder than it should have been.
//
// What you'll see in `az containerapp logs show`:
//   [Nest] ERROR [ApiError] POST /v1/auth/staff/login → 500
//     msg=…actual error message…
//     stack=…
//
// Request body is logged at debug level only (PII risk — staff
// passwords in the login endpoint shouldn't leak to stdout). Anything
// 5xx still gets the stack.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<any>();
    const res = ctx.getResponse<any>();

    const path = `${req?.method ?? '?'} ${req?.originalUrl ?? req?.url ?? '?'}`;
    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? (exception as HttpException).getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let body: any;
    if (isHttp) {
      body = (exception as HttpException).getResponse();
    } else {
      body = { statusCode: status, message: 'Internal server error' };
    }

    if (status >= 500) {
      // Unexpected — full stack to the log.
      const msg = (exception as any)?.message ?? String(exception);
      const stack = (exception as any)?.stack ?? '';
      this.log.error(`${path} → ${status}  msg=${msg}\n${stack}`);
    } else if (status >= 400) {
      // 4xx — log at debug to avoid noise from every 401 / 403, but
      // capture enough to correlate with a user report.
      this.log.debug?.(`${path} → ${status}  ${JSON.stringify(body)}`);
    }

    res.status(status).json(body);
  }
}
