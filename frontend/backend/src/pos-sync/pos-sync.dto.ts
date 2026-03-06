import { IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';

export type SyncOrderInput = {
  externalId?: string;
  data?: unknown;
};

export class PosSyncRequestDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  /**
   * Importante: NÃO usamos validação "deep" (ValidateNested) aqui de propósito.
   * Motivo: se 1 item falhar na validação, o Nest rejeita o batch inteiro (400),
   * e você perde o contrato "resultado por item".
   *
   * A validação por item fica no service.
   */
  @IsArray()
  @IsObject({ each: true })
  orders!: SyncOrderInput[];
}

export type PosSyncItemStatus = 'created' | 'updated' | 'duplicate' | 'invalid' | 'auth_required' | 'error';

export type PosSyncResult =
  | { externalId: string; status: 'created' | 'updated' | 'duplicate' }
  | { externalId: string; status: 'invalid'; reason?: string }
  | { externalId: string; status: 'auth_required' }
  | { externalId: string; status: 'error'; reason?: string };

export class PosSyncResponseDto {
  results!: PosSyncResult[];
}