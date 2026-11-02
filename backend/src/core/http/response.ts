export function ok<T>(data: T): { success: true; data: T; error: null } {
  return { success: true, data, error: null };
}

export function fail(
  code: string,
  message: string,
): { success: false; data: null; error: { code: string; message: string } } {
  return { success: false, data: null, error: { code, message } };
}
