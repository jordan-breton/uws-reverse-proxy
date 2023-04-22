# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased
### Added
- A more performant HTTP client supporting HTTP pipelining, Keep-Alive and connection pooling to replace `node:http` (see #2)
- Error handling (you can handle errors and customize the error response) (see #2)
- Started test coverage.
    - Unit Tests for the HTTP Response parser

### Improved

- Huge performance issue (see #2) with a custom HTTP Client & HTTP Response parser
    - There is still room for improvement, but it's now more than acceptable since the proxy handle 
      more connection than most NodeJS frameworks.

## 3.1.1 - 2023-03-23
### Changed

- Changed code licensing from AGPL 3.0 and later to LGPL 3.0 or later. This change is retroactive.

## 3.1.0 - 2023-03-22
### Added
- Code API now generated with typedoc
- Added typedoc generation to GitHub action
- Added error response customisation

### Removed
- Integration examples with express, fastify, koa and nestjs. It have been replaced by a link to
  the examples repository.

### Fixed
- Error handling. No more connection shutdown without trying to send a proper error response.
- Various comments to fit the new documentation generation tool.

## 3.0.3 - 2023-03-17
### Fixed
- Install section in documentation (now use the npm package instead of GitHub repository)
- Outdated examples in README
- README spell checked
- Code-api and comments spell checked

## 3.0.2 - 2023-03-17
### Added
- Changelog
