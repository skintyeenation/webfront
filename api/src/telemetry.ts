/**
 * OpenTelemetry bootstrap — ships traces, metrics, and logs to a single OTLP
 * collector (the Aspire Dashboard) so all of the API's observability lives in
 * ONE pane instead of being scattered across the Azure portal, `az` CLI, and
 * Swagger.
 *
 * Enabled ONLY when OTEL_EXPORTER_OTLP_ENDPOINT is set, so importing this from
 * tests / one-off scripts is a harmless no-op. Configure per environment:
 *   • local dev → http://localhost:18889   (docker compose `aspire-dashboard`)
 *   • prod (ACA) → the dashboard's internal OTLP endpoint
 *
 * gRPC OTLP (port 18889) is the Aspire Dashboard's default ingestion path, and
 * all three signals share OTEL_EXPORTER_OTLP_ENDPOINT (gRPC appends no path).
 *
 * IMPORTANT: this module must be imported FIRST in main.ts — OpenTelemetry has
 * to monkey-patch http/express/pg BEFORE Nest (and Prisma's pg driver) load,
 * or those libraries won't be traced.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

let started = false;

if (endpoint) {
  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'skintyee-api';
  const serviceVersion =
    process.env.OTEL_SERVICE_VERSION ?? process.env.GIT_SHA ?? '0.1.0';

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'service.version': serviceVersion,
      'deployment.environment.name': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: endpoint }),
      exportIntervalMillis: 15_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ url: endpoint })),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans are extremely noisy and low-value for an HTTP API.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  started = true;

  // Mirror the API's existing console logging into the dashboard's structured
  // logs view (see below).
  installConsoleBridge();

  // Flush pending telemetry on shutdown so the last requests/logs aren't lost
  // when ACA stops the container (SIGTERM) or you Ctrl-C locally.
  const shutdown = () => {
    void sdk
      .shutdown()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  // eslint-disable-next-line no-console
  console.log(`▸ OpenTelemetry → ${endpoint}  (service=${serviceName})`);
}

/**
 * Bridge console.* → OTEL logs so the API's existing stdout logging (main.ts,
 * PrismaService, the global exception filter) appears in the dashboard's
 * structured-logs view — without rewriting every call site. The original
 * console output is preserved (it still goes to stdout / ACA console logs).
 */
function installConsoleBridge(): void {
  const logger = logs.getLogger('console');
  const levels: Array<['debug' | 'log' | 'info' | 'warn' | 'error', SeverityNumber, string]> = [
    ['debug', SeverityNumber.DEBUG, 'DEBUG'],
    ['log', SeverityNumber.INFO, 'INFO'],
    ['info', SeverityNumber.INFO, 'INFO'],
    ['warn', SeverityNumber.WARN, 'WARN'],
    ['error', SeverityNumber.ERROR, 'ERROR'],
  ];
  for (const [method, severityNumber, severityText] of levels) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]): void => {
      original(...args);
      try {
        logger.emit({
          severityNumber,
          severityText,
          body: args
            .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
            .join(' '),
        });
      } catch {
        /* never let telemetry break the app */
      }
    };
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const telemetryEnabled = (): boolean => started;
