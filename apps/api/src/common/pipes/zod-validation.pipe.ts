import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

type ParseableSchema = {
  parse: (value: unknown) => unknown;
};

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ParseableSchema) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      throw new BadRequestException(
        'Validation failed: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
      );
    }
  }
}
