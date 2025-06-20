# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

This repository appears to be empty or newly initialized. The only existing file is a Claude Code settings file at `.claude/settings.local.json` which contains permissions configuration allowing the use of Bash find commands.

## Current State

- No source code files detected
- No package managers or build tools configured
- No existing documentation or README files
- No specific architecture or patterns to analyze

## Notes for Future Development

When code is added to this repository, future Claude Code instances should:

1. Analyze the project structure and identify the primary programming language and framework
2. Look for standard configuration files (package.json, requirements.txt, Cargo.toml, etc.) to understand build and development commands
3. Check for existing documentation patterns and follow them
4. Identify testing frameworks and test running procedures
5. Update this CLAUDE.md file with relevant development commands and architectural insights

## Project Management

This repository uses Context7 MCP for project management and documentation:

- Use Context7 tools when helpful to reference and maintain `tasks.md` and `planning.md` files
- Update these files as needed when working on features or making changes
- Context7 helps maintain project context and task tracking across sessions

## Deployment

**Vercel Deployment Fixed:**
- Fixed `rate-limiter-flexible` version issue (changed to `^2.4.2`)
- Updated googleapis compatibility
- Added serverless API structure in `/api` folder
- Created `vercel.json` configuration
- Removed problematic dependencies for serverless deployment

**Environment Variables Needed:**
- Supabase credentials (URL, keys)
- OpenAI API key
- Google Maps API key
- Google OAuth credentials

## Current Permissions

The repository has Claude Code permissions configured to allow Bash find commands and MCP server management via `.claude/settings.local.json`.