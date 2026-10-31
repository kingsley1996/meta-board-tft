// Riot's domain verification asks for the code alone at /<locale>/riot.txt.
// Anything else in the body — a newline, HTML, a redirect to an error page —
// reads as a failed check, so this returns the token verbatim.
const TOKEN = '42758374-4a6f-42d9-b9c0-eeec248018ae';

export function GET() {
  return new Response(TOKEN, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
