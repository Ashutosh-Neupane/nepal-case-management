import { BadRequestException } from '@nestjs/common';
import { WorkflowError } from '../cases/workflow';

/** Runs an action and turns workflow errors into 400 responses. */
export async function asBadRequest<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof WorkflowError) throw new BadRequestException(error.message);
    throw error;
  }
}

export function page(query: { page?: string; pageSize?: string }) {
  const size = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const number = Math.max(1, Number(query.page) || 1);
  return { take: size, skip: (number - 1) * size, page: number, pageSize: size };
}
