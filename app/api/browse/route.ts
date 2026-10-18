import { getApi } from "@/lib/deps"

export const maxDuration = 60
export const GET = (req: Request) => getApi().handle(req)
