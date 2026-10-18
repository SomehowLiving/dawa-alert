import { getApi } from "@/lib/deps"

export const maxDuration = 30
export const POST = (req: Request) => getApi().handle(req)
