# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
[3fccdae](3fccdae0eb2706a0e210a9bb50572a3e069f1bc8)...[58a9f61](58a9f6114f15c94f03ac9e1853fff10f9143b993)

### 🚨 BREAKING CHANGES

- Simplify processIncomingMessage signature with Options Object ([56e86df](56e86df024dabfd527b6458283491b5dfe0a347f)) - (Lin Yang)



### 🚀 Features

- Add timeout to message processing to prevent indefinite blocking ([64a2e19](64a2e19e1ddf3692e7d77331cb130c26ed2d8e30)) - (Lin Yang)
- Add repository dependency keys ([efbec95](efbec95c96a3a17e805cdbdbee9dcdcaf83af0ba)) - (Lin Yang)
- Add repository factory functions ([ee93967](ee9396702ff9e8c43b13967cd5845b910bb03fb7)) - (Lin Yang)
- Register repository services in DI container ([bdf820e](bdf820e1fe51b517fc741fa250e16794d174e029)) - (Lin Yang)
- Add AccountStateManager class ([3a8bdca](3a8bdcac7a2680dbdcef6b557743515855bc7e9f)) - (Lin Yang)
- Register AccountStateManager in DI container ([403d24c](403d24c6327d56722dd68a1e8d7149e848494ed9)) - (Lin Yang)
- Add npm publish workflow for third-party plugin distribution ([7d2ee6e](7d2ee6ec578dae5744cb3e7dc690d2f0a09a94fe)) - (Lin Yang)
- Add auto changelog and GitHub Release generation ([a7ea1a2](a7ea1a27c7647cc93acd4ee59670f02f78086c50)) - (Lin Yang)
- Add changelog automation scripts and full changelog ([fa3bdc2](fa3bdc2e223850df739d5576db34f574c79eb6c9)) - (Lin Yang)
- Add manual trigger workflow_dispatch for npm publish ([1869f12](1869f12b65b2cb5f0541e2370eb276d287b3da18)) - (Lin Yang)

### 🐛 Bug Fixes

- Add cross-platform path resolution for Windows compatibility ([fbdfe89](fbdfe89a8e1d2298dd5375ecd679ea83248a4100)) - (Lin Yang)
- Use cryptographically secure random for messageId generation ([002bcd8](002bcd891d636c068c125d240b640741685750da)) - (Lin Yang)
- Override tar dependency to address CVE vulnerability ([1e56911](1e569118d38520d58e884619c7670e7a12d46b3c)) - (Lin Yang)
- Skip polling cycle when allowFrom store read fails ([b8606b1](b8606b137c87e426efac667dc9efcbc0189d9584)) - (Lin Yang)
- Use defensive programming for config validation resolution ([8b76a34](8b76a34e9e3be73389ce180e18565b3db9196b98)) - (Lin Yang)
- Prevent overlapping watch loop executions ([a496c63](a496c633eaad8d94105aba68defb57d712f94a70)) - (Lin Yang)
- Replace CommonJS require() with ESM imports in DI module ([41d9ffb](41d9ffb395949f9b5e3f8accdaf05790b14ca4ff)) - (Lin Yang)
- Clear pendingPairings Map on account removal and stop ([17e4b5c](17e4b5cd053a47de87cb40866ede7b666b2271ac)) - (Lin Yang)
- Replace unsafe type assertions with type-safe checks in validation ([dc766ea](dc766ea5ad9cf9ec5ab3ebdee90024a801d83109)) - (Lin Yang)
- Log probe errors instead of silently ignoring them in collectWarnings ([b1f01a5](b1f01a5cc50a90db379b9f4a85bed2a912630461)) - (Lin Yang)
- Replace unsafe type assertions with type-safe guards ([e309c70](e309c703ab77607399ff470ee9e4d8e0edeef71e)) - (Lin Yang)
- Standardize error handling with extractErrorMessage utility ([964b4b7](964b4b71c984e56ce7c51f0c78b98fae9a80fe3a)) - (Lin Yang)
- Add logging for silent config failure in directoryListPeersImpl ([f70ee69](f70ee6984690d0e2954b54204754b8996aa56ca3)) - (Lin Yang)
- Validate peer parameter in URL to prevent path traversal (CWE-20) ([3c6a89f](3c6a89f1e7aee48b743a02e50dcb9cb851eea309)) - (Lin Yang)
- Exclude auth errors from retry logic (CWE-755) ([9689e0b](9689e0bb6963d476c8e5031c49900803676a7dd8)) - (Lin Yang)
- Add log sanitization to prevent log injection (CWE-117) ([c4b4b02](c4b4b025cdfd80e19bc897e700de8470fa6bc251)) - (Lin Yang)
- Add max-delay flush to prevent watermark data loss on crash ([79e9297](79e929744971119a25731daa4ad50e2de570d3ab)) - (Lin Yang)
- Set watchInterval to null after clearing in removeAccountState ([4cea3c8](4cea3c8d2fcba28a4b63346f82f9423e85fe477a)) - (Lin Yang)
- Use pending flag instead of blocking in watch loop to prevent skipped iterations ([940fe80](940fe808725d4c732add4cc853a3f39e292c39d9)) - (Lin Yang)
- Add error recovery in watch loop to prevent single point of failure ([bb1e916](bb1e916b77ea4d45fc9af41b27b3825d170dd362)) - (Lin Yang)
- Add batch size limit to prevent memory spikes from large chat histories ([e758bf6](e758bf618cf5b01b7fc4a42cd7c272c3912293e4)) - (Lin Yang)
- Add optional timeout to Semaphore acquire to prevent infinite wait ([873bf76](873bf76f677ed3e42f933e1ea281dfdda4f1933c)) - (Lin Yang)
- Add TTL-based cleanup for pendingPairings Map ([633708f](633708f6c4a14c3c47e5057ab50ac6d0af65bd97)) - (Lin Yang)
- Add allowFrom cache to eliminate redundant async calls per poll/watch cycle ([aec1c55](aec1c551138470cf185a9fdd8c99a3d476c3507d)) - (Lin Yang)
- Add group permission cache to eliminate repeated lookups ([6fc3e58](6fc3e587638fc289d8d69adf2aace54e48184787)) - (Lin Yang)
- Resolve race condition in Semaphore timeout handling ([fb551f0](fb551f059438b3060fde96e16713c1dc86473cc5)) - (Lin Yang)
- Use LRU cache for groupPermissionCache to prevent unbounded growth (CWE-400) ([f27cfaf](f27cfafcd5417025d3145b4fdea9c44efc3c3e75)) - (Lin Yang)
- Add message length validation to prevent memory exhaustion (CWE-20) ([7c0e436](7c0e436cf98ff721f057d80f8b8b3ec5f05b323b)) - (Lin Yang)
- Update tar package to >=7.5.7 to resolve 4 HIGH vulnerabilities (CWE-1392) ([ac73f95](ac73f95c007bbab5e7eb9de8d6a7d45d7aaf5978)) - (Lin Yang)
- Add comprehensive input validation to API client (CWE-20) ([2f94844](2f94844ac1663bbb2ed24c6d454b36b748b2a424)) - (Lin Yang)
- Consistent error handling in sendZTMMessage (Result pattern) ([3527242](3527242d7e5ea5479b8d321c5318d77988da7d8f)) - (Lin Yang)
- Eliminate race condition in Semaphore.release() ([346c5cf](346c5cf0728e38a722dd1efd56b5152cc9756914)) - (Lin Yang)
- Add TTL support to GroupPermissionLRUCache ([b1afdff](b1afdffc17d61ef50d27f34e556c7ec8bec2f89e)) - (Lin Yang)
- Add periodic cleanup for pending pairings ([32cc854](32cc854d4056266c841d3059c250f66cbf74d376)) - (Lin Yang)
- Async callback execution with semaphore to prevent blocking watch loop ([a9a0419](a9a04199ce53431f59e3ef47c6a65bb0055263a3)) - (Lin Yang)
- LRU cache eviction bug and add comprehensive tests ([28ac71a](28ac71a79e3cce118738d2c823e79cf77bb84bb7)) - (Lin Yang)
- Resolve ESLint no-unused-vars errors ([ae98962](ae989622df22e531dc59ec19bc7562aaa33faad4)) - (Lin Yang)
- Eliminate ESLint no-explicit-any warnings and resolve test errors ([c414e65](c414e653db1a1f6954eaf7748c7257dfb82cc041)) - (Lin Yang)
- Resolve TypeScript type errors and enable type checking ([37db60a](37db60adedae5b520def1e09b22bb7c9b1b6fb7c)) - (Lin Yang)
- Use incrementing counter instead of timestamp for LRU ordering ([bdc11ea](bdc11ea74818ca0afe1b09a316bf4b09a7e1139d)) - (Lin Yang)
- Extract WATCH_ERROR_THRESHOLD constant from hardcoded value ([3161d9a](3161d9ac798d90231b21c33f6138db383eb536c4)) - (Lin Yang)
- Update publish workflow tag pattern to match v*.*.* format ([b6a123d](b6a123db8bf212de6ee9dc9fbd4287d21dee3d8f)) - (Lin Yang)
- Use taiki-e/install-action for git-cliff in CI ([ab782a3](ab782a3e49c96e68b08de392d4800dc4952d8057)) - (Lin Yang)
- Generate proper changelog in CI instead of using unreleased ([c85d0d6](c85d0d6b2e6795aa05a721b553f40a3d5ae10d8b)) - (Lin Yang)
- Use local CHANGELOG.md for GitHub Release notes ([b9f6594](b9f6594a92d936dddd800f194073c7feb6517b60)) - (Lin Yang)
- Adjust tag pattern order for GitHub Actions ([b061903](b0619031d0b903654776cca9e6ed39a101679576)) - (Lin Yang)
- Use double quotes for tag pattern in publish.yml ([f878f2d](f878f2de184e2e1bf71c1b313c0fd243b03c9434)) - (Lin Yang)
- Use glob patterns for tag trigger in publish.yml ([f395327](f395327bfcd6906e11f9a2744a9cf23f853a6f53)) - (Lin Yang)
- Use specific glob patterns for tag trigger ([47beea2](47beea21d9ee523ff28f322bee7289e66a59319e)) - (Lin Yang)

### 🔒 Security

- Add accountId validation to prevent path traversal ([7684c49](7684c4969acf9b48dfd4fbbb7722f2db2b1555e6)) - (Lin Yang)
- Add HTML escaping to prevent XSS attacks ([68a5b24](68a5b24a851fa5cd4b485ac8cb793efbc4601dc6)) - (Lin Yang)

### ⚡ Performance

- Use lazy loading and async I/O for state store ([9b54af4](9b54af4c8db668fba88d28366a7178ed6639022a)) - (Lin Yang)
- Eliminate duplicate getChats() API call ([4d6a9a9](4d6a9a9148d7a841c7d39ddf76468df96f98a55f)) - (Lin Yang)
- Add memory management for accounts and per-account stores ([add93a9](add93a976af919482cd6f0ee9ec1d83ced1d4dbc)) - (Lin Yang)
- Use single-pass array classification instead of multiple filter() ([48b7117](48b711717c0c85c5d3bdd43d466e696cb9523ca3)) - (Lin Yang)

### ♻️ Refactor

- Extract normalizeUsername to shared utils module ([36c8407](36c84076456c8ee95a05f34c77e5349736be811f)) - (Lin Yang)
- Remove defaultInstance, use per-account stores exclusively ([dd8cebe](dd8cebe509155e8e0c827015684ee5ed2c29d991)) - (Lin Yang)
- Split long startAccountGateway function ([7581890](75818901cd4f7d0eb64f298d6241d84ab786f2aa)) - (Lin Yang)
- Add structural section comments to plugin definition ([7191353](719135397384035aa0b015ca05c5c1e0c1ac2aee)) - (Lin Yang)
- Extract complex functions to reduce nesting complexity ([d768ad3](d768ad3b347142f372d4415ef4ea923d38e8af16)) - (Lin Yang)
- Extract chat processing logic to reduce nesting depth ([1e5cf1c](1e5cf1c34b2ce678ee95d80d89cf89caa8ba8325)) - (Lin Yang)
- Extract shared chat processing logic to eliminate duplication ([4e2e2af](4e2e2afd81180c969ca6636323f125450f202942)) - (Lin Yang)
- Apply interface segregation principle to IApiClient ([339eed7](339eed70154a1bc3ff20c16076e24dcbc079f4fc)) - (Lin Yang)
- Extract magic numbers into centralized constants ([1464dae](1464dae2c683cc733315c3bfd6dc5e53ad2d9bed)) - (Lin Yang)
- Standardize ZTM naming convention (Ztm -> ZTM) ([88b004a](88b004af44b623cefc5ede5dec932eeda7390154)) - (Lin Yang)
- Extract ConnectivityManager and MessageDispatcher from Gateway ([c08943e](c08943e581b53d2bf49c948bbd132ca0eca01c78)) - (Lin Yang)
- Use lazy initialization for runtimeProvider ([693e5a6](693e5a6b0203ac69d8aa06c6fe68430c5a0fd5b1)) - (Lin Yang)
- Add consistent logger access via getLogger() ([c30372a](c30372a15cc2fa26071bda27db015345231bb5b7)) - (Lin Yang)
- Update deprecated type imports from inbound.ts ([05bcca1](05bcca12a742bb69cf2c29c697e5de014ff48c55)) - (Lin Yang)
- Remove inbound.ts compatibility layer ([b83d53a](b83d53a177ef3de2d0e16b1b1589bfcada11baa9)) - (Lin Yang)
- Extract shared message processing logic to eliminate code duplication ([f022924](f022924194260a47ac8e9f717ba962af60ec9af6)) - (Lin Yang)
- Decompose complex watchLoop function into WatchLoopController class ([f86dae0](f86dae0413c7c8bfc9bccb83206a946eeadbe2ff)) - (Lin Yang)
- Extract magic numbers to constants ([712f7c4](712f7c4acbb711f182f10c5fd32a2a565b5e7c4b)) - (Lin Yang)
- Add consistent null/undefined handling utilities ([32df5cd](32df5cd67aa65cfb52f347722ac1fa661d60440e)) - (Lin Yang)
- Use guards utilities for null/undefined handling ([6ae7fc0](6ae7fc004cfa0f511d43a2f372ff02c9923b40a5)) - (Lin Yang)
- Introduce repository pattern to decouple messaging from runtime ([515a039](515a039ab639e16eb15553d53aedcfab878588c1)) - (Lin Yang)
- Use DI container for dependencies ([89dd787](89dd787cbff5f09e628a65381fc8e4b24c39ca48)) - (Lin Yang)
- Use DI container for dependencies ([ee9ecbb](ee9ecbba9e10486c22d8c71d8b2946a7c0258e44)) - (Lin Yang)
- Use DI container for dependencies ([a2f0df0](a2f0df0289440bd20ca5a16a3245be64ac0bf181)) - (Lin Yang)
- Extract GroupPermissionLRUCache to separate cache module ([d9045dd](d9045dd2b90ac27d73a7259c67b953feafbce172)) - (Lin Yang)
- Replace any types with proper interfaces in plugin.ts ([d781997](d781997f4f79d88cb813d0aa4265734a0332df34)) - (Lin Yang)

### ✅ Testing

- Add unit tests for API and channel modules ([d5c05bd](d5c05bd30011b00c3e41157dd0a9ee327264887d)) - (Lin Yang)
- Add security tests for input validation ([df47abd](df47abd968e461a4aece0381b8054fe2c70b01c5)) - (Lin Yang)
- Add authorization tests for pairing flow ([b49f870](b49f8708d17454b479fd80f3b0c4ba997a3883d2)) - (Lin Yang)
- Add race condition tests for concurrent account initialization ([8a6b41e](8a6b41ed4e54c429482693efe444647a15b9e65b)) - (Lin Yang)
- Extract mock factories to shared fixtures ([c561bb2](c561bb2536df1e12cb7923afdcce57a9f5006978)) - (Lin Yang)
- Add async flush tests for MessageStateStore ([905266c](905266c6ae870e3a4b103905691c6c621c9fde90)) - (Lin Yang)
- Add comprehensive unit tests for watcher.ts ([f9ad1a3](f9ad1a372fd62c99c172357ee7c72bd60d3a4ec1)) - (Lin Yang)
- Add crash recovery tests for debounce window ([ac9f3e0](ac9f3e0ed7856db1b3d6aadc520f43fe9318d054)) - (Lin Yang)
- Add concurrent account removal tests during operations ([38ec3b0](38ec3b02b03544cf9de3c89c88cca551bdc043d8)) - (Lin Yang)
- Add dedicated test file for mesh-api.ts ([af57244](af57244e70cfe7e585a49400f28eb6a4285b2da9)) - (Lin Yang)
- Add error handling tests for onboarding wizard ([62f2ab0](62f2ab09734d06cbbd24835f32bb5f7a3997d161)) - (Lin Yang)
- Add time-based edge cases and clock manipulation tests ([11d0d96](11d0d9620b17d0901c855b6993cf8ccebec188c4)) - (Lin Yang)
- Expand watcher.ts tests with timing and iteration scenarios ([df40072](df40072de1f452fd74c1feed1717d8ebe7774e37)) - (Lin Yang)
- Add comprehensive unit tests for message-dispatcher.ts ([3dc60e9](3dc60e90e0ac9f0282dea25c8710d135756508cb)) - (Lin Yang)
- Expand inbound.ts tests with re-export verification ([ad48dd3](ad48dd32ca0c0849287655b6d939ec13b6e6e4a8)) - (Lin Yang)
- Add chat-processor.ts unit tests with 95% coverage ([f9f83b9](f9f83b9bd017992ddb18aa53720677aaae6f3538)) - (Lin Yang)
- Improve runtime.ts coverage from 4% to 82% ([fd4f41b](fd4f41bb5ae3d39633fa0fb9db557f98be18b1a6)) - (Lin Yang)
- Improve coverage for state, errors, and log-sanitize modules ([c64e432](c64e432d1a38002484590673537f6b1b5fba6e81)) - (Lin Yang)
- Add LRU cache tests and fix eviction bugs ([c9b2675](c9b267561edc3de2a79676d4da381572284e336b)) - (Lin Yang)
- Add MAX_MESSAGE_LENGTH boundary tests to processor ([9f0868d](9f0868dd549ba729b7aebc4a50d41d9caa27e532)) - (Lin Yang)

### 💄 Styling

- Apply Prettier formatting to source files ([f3ae8c1](f3ae8c11f20535ae98a24718f4ec983a936a9e41)) - (Lin Yang)

### 🔨 Build

- Add verbatimModuleSyntax to tsconfig for stricter type imports ([eb5ce78](eb5ce78d1f9e10ab7e30f69120d6ac324ac807b7)) - (Lin Yang)
- Bump eslint from 9.39.2 to 10.0.0 (#3) ([e28bcd3](e28bcd385e0280534312e7d3459bf28e731b8b24)) - (Lin Yang)
- Bump openclaw from 2026.2.9 to 2026.2.15 (#4) ([48000c2](48000c2402a25554cac59c9c4c06bfc41f1275a0)) - (Lin Yang)

### 📖 Documentation

- Update release version badge to use date sorting ([8f7e4bf](8f7e4bf88a0ff8add21f6fefbdf6656760b2f4d3)) - (Lin Yang)
- Add comprehensive JSDoc to public API functions ([7fe7186](7fe7186dd5870213b677cf68e97cd4023580ca46)) - (Lin Yang)
- Sync README with code implementation ([b5d0153](b5d015347021eca016f688cb8a2e30e047d16290)) - (Lin Yang)
- Distinguish npm install vs local dev installation in README ([c7782c3](c7782c3b0d0d641889bff58151eda0e4aaf68e4f)) - (Lin Yang)

### 🔧 Miscellaneous Tasks

- Upgrade @types/node from 20.x to 24.x ([52b0363](52b03633a9b8e31513714359b7ea0e8733a986b4)) - (Lin Yang)
- Remove review artifacts and ignore them in future ([63ade3d](63ade3d50310b57ccb71bd615dd95b4d05df67f5)) - (Lin Yang)
- Add CLAUDE.md to .gitignore ([2c4c41a](2c4c41a0a26173d07138c521d54dc6acb1ab470d)) - (Lin Yang)
- Add .claude/ directory to .gitignore ([cb9949c](cb9949c79f438eaa6606e6e9fb6ee8f8c800a313)) - (Lin Yang)
- Add .mcp.json to .gitignore ([9197a2d](9197a2dcb81d3b38252048a775c2e379cf1bf4ef)) - (Lin Yang)
- Remove review archive and analysis files ([e1cb82a](e1cb82acec4d860e302303809d67fc252bafd8ea)) - (Lin Yang)
- Add ESLint and Prettier configuration ([b59f63f](b59f63f7adc7f0d404a1dc54a7b84199ef1b18df)) - (Lin Yang)
- Add Dependabot for automated dependency updates ([2b39237](2b39237df0b82d00967f6505dfcbfa0e4323a988)) - (Lin Yang)
- Update package-lock.json for npm publish setup ([b732c79](b732c799007614c6ac5675ce2d85d376ff316410)) - (Lin Yang)
- Migrate from conventional-changelog to git-cliff ([ff0ac3d](ff0ac3d41d4e5f8f1586095d2f8d2660828e05e9)) - (Lin Yang)
- Update GitHub Actions workflow for enhanced versioning support ([6e3172d](6e3172d3bb277481dfdfff0874889f5484f80552)) - (Lin Yang)
- Add tag flag for npm publish and support prerelease versions ([5570a62](5570a629ea8278b6275e161350bedd01a0b903df)) - (Lin Yang)
- Update changelog ([3b6531f](3b6531fc8051687f6b098276fd05e3eb8019f14a)) - (Lin Yang)
- Release v2026.2.18-beta.1 ([2a5efcf](2a5efcff2e96435c40d335cfff990f90a3b07352)) - (Lin Yang)
- Update changelog configuration and regenerate ([58a9f61](58a9f6114f15c94f03ac9e1853fff10f9143b993)) - (Lin Yang)

## 2026.2.15 - 2026-02-15




### 🚀 Features

- Initial commit for openclaw-channel-plugin-ztm ([e8afcad](e8afcada275087a1f3812d5713974f904343d03e)) - (Lin Yang)
- Support permitSource configuration for permit.json (#2) ([fe83119](fe8311955bf896e680bc426357f56f340c83ae7e)) - (Lin Yang)

### 🐛 Bug Fixes

- Correct GitHub repo path in badges ([4671306](4671306649f0034cb2a4620a3234cc3d9d0f6f1c)) - (Lin Yang)




### ✅ Testing

- Fix flaky sleep test by relaxing timing tolerance ([a69ae81](a69ae8149afc0a79ae16b9d6220ff0a13c1bcdf9)) - (Lin Yang)



### 📖 Documentation

- Fix README paths and add missing helpers.ts ([75efbad](75efbad45a917916248939d49cc1b4868e420812)) - (Lin Yang)
- Update README with ZTM API and test coverage ([d67aa74](d67aa742043c373ebbd47696fd7618a0827f1fc4)) - (Lin Yang)
- Refine Policy Decision Matrix in README ([b69cc51](b69cc5165853afaab40d837dc443391e73033ade)) - (Lin Yang)
- Update Architecture diagram with ZTM Agent API ([fac284a](fac284aee280d179dfd818088fc582b442934e08)) - (Lin Yang)
- Add badges to README ([87b0387](87b0387880e7e28a6adcdd228a79138bf95b5745)) - (Lin Yang)
- Replace npm badge with release version badge ([6521c35](6521c35f6bb3cdf885c0564403b1cdafe5887e47)) - (Lin Yang)

### 🔧 Miscellaneous Tasks

- Add MIT License to the project ([ebc9ffd](ebc9ffdca2112de4ab54e3f82a9d22fe00beade4)) - (Lin Yang)
- Add GitHub Actions test workflow (#1) ([d99d8e2](d99d8e2ab1608a3245da56d648cee688da9d404f)) - (Lin Yang)
- Bump version to 2026.2.15 ([3fccdae](3fccdae0eb2706a0e210a9bb50572a3e069f1bc8)) - (Lin Yang)

<!-- generated by git-cliff -->
