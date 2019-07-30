// @flow
const { internalServerError } = require('./response');
const { errorRoute, respondRoute } = require('../events/routeEvents');

/*::
import type { IncomingMessage, ServerResponse } from 'http';
import type { Readable } from 'stream';
import type { EventLogger } from '../services/log.2';

export type Route = {
  test: (inc: IncomingMessage) => boolean,
  handler: (inc: IncomingMessage, out: ServerResponse) => Promise<void>,
};
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTION' | 'HEAD';
*/

const createQuery = (url) => {
  const [,queryString = ''] = url.split('?');
  const keyValueStrings = queryString.split('&');
  const keyValues = keyValueStrings.map((keyValueString)/*: [string, string]*/ => {
    const [key, value] = keyValueString.split('=');
    return [key, value];
  });
  return keyValues;
};

const createHeaders = (rawHeaders) => {
  const headers = [];
  for (let i = 0; i < rawHeaders.length/2; i++) {
    const headerName = rawHeaders[i * 2];
    const headerValue = rawHeaders[(i * 2) + 1]
    headers.push([headerName, headerValue])
  }
  return headers;
};

const createRESTRoute = ({ log }/*: EventLogger*/) => (
  path/*: string*/,
  getResponse/*: (
    query: Array<[string, string]>,
    headers: Array<[string, string]>,
    body: Readable
  ) => Promise<{
    statusCode: number,
    headers: Array<[string, string]>,
    body:
      | { type: 'string', content: string }
      | { type: 'buffer', content: Buffer }
      | { type: 'stream', stream: Readable },
  }>*/,
  method/*: HTTPMethod */ = 'GET',
)/*: Route*/ => {
  const test = (inc) => {
    const [incPath] = inc.url.split('?');
    return incPath === path && inc.method === method;
  };
  const handler = async (inc, out) => {
    const response = await getResponse(
      createQuery(inc.url),
      createHeaders(inc.rawHeaders),
      inc,
    ).catch(error => {
      log(errorRoute(error.message, error.stack));
      return internalServerError();
    });
    out.statusCode = response.statusCode;
    for (let [headerName, headerValue] of response.headers) {
      out.setHeader(headerName, headerValue);
    }
    switch(response.body.type) {
      case 'string':
      case 'buffer':
        const { content } = response.body;
        out.write(content);
        out.end();
        break;
      case 'stream':
        const { stream } = response.body;
        stream.pipe(out);
        // once the stream ends, close the HTTP connection
        await new Promise(res => stream.on('end', res));
        out.end();
        break;
    }
    log(respondRoute(inc.url, inc.method, response.statusCode));
  };

  return {
    test,
    handler,
  }
};

module.exports = {
  createRESTRoute,
};