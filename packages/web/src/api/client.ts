export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export async function fetchApi<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  if (!res.ok) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = await res.text().catch(() => null)
    }
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`
    throw new ApiError(message, res.status, body)
  }

  if (res.status === 204) {
    return null as unknown as T
  }

  return res.json() as Promise<T>
}

export async function fetchApiText(path: string, options?: RequestInit): Promise<string> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
  })
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status)
  return res.text()
}
