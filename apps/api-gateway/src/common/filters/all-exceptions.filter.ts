import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'

interface RpcError extends Error {
  code?: string
  details?: unknown
}

const RPC_CODE_TO_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  RPC_TIMEOUT: 503,
  RPC_TRANSPORT_ERROR: 503,
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<FastifyReply>()
    const req = ctx.getRequest<FastifyRequest>()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      this.logger.warn({
        event: 'ERROR_GATEWAY_HTTP',
        status,
        method: req.method,
        url: req.url,
        message: exception.message,
      })
      res.status(status).send(typeof body === 'string' ? { message: body } : body)
      return
    }

    const rpcErr = exception as RpcError
    const code = rpcErr?.code
    if (code && RPC_CODE_TO_STATUS[code]) {
      const status = RPC_CODE_TO_STATUS[code]
      this.logger.warn({
        event: 'ERROR_GATEWAY_RPC',
        status,
        code,
        method: req.method,
        url: req.url,
        message: rpcErr.message,
      })
      const body: Record<string, unknown> = { statusCode: status, code, message: rpcErr.message }
      if (code === 'RPC_TIMEOUT' || code === 'RPC_TRANSPORT_ERROR') {
        body.hint = 'downstream service not ready or unreachable'
      }
      res.status(status).send(body)
      return
    }

    this.logger.error({
      event: 'ERROR_GATEWAY_UNHANDLED',
      method: req.method,
      url: req.url,
      err: rpcErr instanceof Error ? { message: rpcErr.message, stack: rpcErr.stack } : rpcErr,
    })
    res.status(500).send({ statusCode: 500, message: 'Internal server error' })
  }
}
