# WCL MCP Server

MCP server that exposes the Warcraft Logs GraphQL API as tools for AI-assisted WoW performance analysis.

## Setup

1. Register a WCL API application at https://www.warcraftlogs.com/api/clients/
2. Copy `.env.example` to `.env` and fill in your credentials
3. Install and build:

```bash
npm install
npm run build
```

## MCP Client Config

Add to your MCP client (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "warcraftlogs": {
      "command": "node",
      "args": ["/path/to/wcl-mcp/dist/index.js"],
      "env": {
        "WCL_CLIENT_ID": "your-client-id",
        "WCL_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Tools (13)

| Tool | Description |
|------|-------------|
| `set_active_character` | Set session character defaults |
| `get_character_summary` | Character WCL presence overview |
| `get_recent_reports` | Report discovery with fight metadata |
| `get_fight_summary` | Composite fight overview |
| `get_fight_damage` | DPS/damage breakdown |
| `get_fight_healing` | HPS/healing with overhealing % |
| `get_fight_damage_taken` | Damage taken by source |
| `get_character_deaths` | Death analysis across fights |
| `get_character_casts` | Cast frequency analysis |
| `get_buff_uptime` | Buff/debuff uptime tracking |
| `get_combatant_info` | Player setup (class, spec) |
| `get_encounter_rankings` | Parse rankings |
| `get_fight_events` | Raw combat events |

## Development

```bash
npm run dev      # Run with tsx
npm test         # Run unit tests
npm run build    # Compile TypeScript
```
