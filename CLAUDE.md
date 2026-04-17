# WCL MCP Server

## What This Is
MCP server exposing the Warcraft Logs GraphQL API as 13 tools, 3 resources, and 5 prompts for AI-assisted WoW performance analysis. Single-user, local stdio transport.

## Tech Stack
TypeScript, Node.js, @modelcontextprotocol/sdk, graphql-request, zod, dotenv, vitest

## Project Structure
- `src/index.ts` -- server entry point, registers all tools/resources/prompts
- `src/wcl/client.ts` -- WCL API client (OAuth, retry, circuit breaker, cache-first)
- `src/wcl/queries.ts` -- GraphQL query strings and type definitions
- `src/tools/` -- one file per tool (13 total)
- `src/formatters/` -- response formatters (damage, healing, deaths, casts, buffs, combatants, rankings, common)
- `src/resources/` -- MCP resources (zones, knowledge, active-character)
- `src/session/` -- active character state and LRU cache
- `src/utils/` -- realm/region normalization, logger
- `src/data/` -- static data files (zones.json, wow-knowledge.md)
- `tests/unit/` -- unit tests

## Key Design Patterns
- Session cache: LRU 500 entries, keyed on immutable WCL data
- Formatters pre-compute DPS/HPS/uptime -- server computes, AI interprets
- Compound tools (get_character_deaths, get_character_casts) handle multi-report workflows internally
- Active character defaults: set once, all tools use it
- Structured errors with `suggestion` field for AI recovery guidance
- All logging to stderr (stdout reserved for MCP protocol)

## Commands
```
npm run build    # tsc + copy data files
npm run dev      # tsx src/index.ts
npm test         # vitest run
```

## Architecture Docs
Full design documentation in Obsidian: `/Users/fc/Documents/Obsidian/Notes/WCL MCP Server/`
