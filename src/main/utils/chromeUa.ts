import process from 'node:process'
import { buildChromeLikeUserAgent as build } from '../../shared/chromeUa'

export function buildChromeLikeUserAgent(): string {
  return build(process.versions.chrome ?? '132.0.0.0', process.platform)
}
