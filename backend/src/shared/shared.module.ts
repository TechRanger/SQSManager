import { Module, Global } from '@nestjs/common';
import { RealtimeGateway } from './realtime/realtime.gateway';

@Global() // Make providers available globally without importing SharedModule everywhere
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway], // Export gateway so other modules can inject it
})
export class SharedModule {} 