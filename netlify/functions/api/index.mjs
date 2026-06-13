// Netlify Functions v2 — no AWS Lambda 4KB env var limit
// Static import ensures esbuild bundles express/mongoose/etc. inline
let handler
let initError

try {
  const handlerModule = await import('./handler.cjs')
  handler = handlerModule.handler ?? handlerModule.default?.handler
} catch (err) {
  initError = err
  console.error('[API] Module load failed:', err.message, err.stack)
}

export const config = {
  path: ['/api', '/api/*'],
}

export default async (request, context) => {
  // Return init errors as JSON so we can see what went wrong
  if (initError || !handler) {
    return new Response(JSON.stringify({
      error: 'Function initialization failed',
      message: initError?.message || 'handler not found',
      stack: initError?.stack,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.arrayBuffer()
    const url = new URL(request.url)

    const queryStringParameters = {}
    const multiValueQueryStringParameters = {}
    url.searchParams.forEach((value, key) => {
      queryStringParameters[key] = value
      if (!multiValueQueryStringParameters[key]) multiValueQueryStringParameters[key] = []
      multiValueQueryStringParameters[key].push(value)
    })

    const headers = {}
    request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value })

    const event = {
      httpMethod: request.method,
      path: url.pathname,
      queryStringParameters,
      multiValueQueryStringParameters,
      headers,
      body: body.byteLength > 0 ? Buffer.from(body).toString('base64') : null,
      isBase64Encoded: body.byteLength > 0,
      rawUrl: request.url,
      rawQuery: url.search.slice(1),
      requestContext: { http: { method: request.method, path: url.pathname } },
    }

    const lambdaContext = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'api',
      functionVersion: '$LATEST',
      invokedFunctionArn: '',
      memoryLimitInMB: '1024',
      awsRequestId: crypto.randomUUID(),
      logGroupName: '/netlify/api',
      logStreamName: context.requestId || '',
      getRemainingTimeInMillis: () => 10000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    }

    const result = await handler(event, lambdaContext)

    if (!result || typeof result.statusCode !== 'number') {
      return new Response(JSON.stringify({ error: 'Handler returned invalid result', result }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const responseHeaders = new Headers()
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        Array.isArray(value)
          ? value.forEach(v => responseHeaders.append(key, String(v)))
          : responseHeaders.set(key, String(value))
      }
    }
    if (result.multiValueHeaders) {
      for (const [key, values] of Object.entries(result.multiValueHeaders)) {
        responseHeaders.delete(key)
        const arr = Array.isArray(values) ? values : [values]
        arr.forEach(v => responseHeaders.append(key, String(v)))
      }
    }

    const responseBody = result.isBase64Encoded && result.body
      ? Buffer.from(result.body, 'base64')
      : (result.body ?? '')

    return new Response(responseBody, {
      status: result.statusCode,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error('[API] Request error:', err.message, err.stack)
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
