import { getApi } from "@/lib/deps"

export const POST = (req: Request) => getApi().handle(req)
