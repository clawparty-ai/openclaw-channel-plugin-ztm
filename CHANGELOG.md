# Changelog

All notable changes to this project will be documented in this file.

## 2026.3.2 - 2026-03-02

[6ed2eaf](6ed2eaffb264507f9de452b3a7c653d7d60f9f09)...[be1f0c8](be1f0c8314b520be1728c1aa1f00a7dca3efa2aa)



### 🚀 Features

- Implement OpenClaw ChannelPlugin adapters (#33) ([f0bda74](f0bda74a239c5e3521616fa44a2aeb910f47ee15)) - (Lin Yang)
- Implement complete ChannelOnboardingAdapter (#34) ([7a37d1b](7a37d1b4a68deed68bec7bb257c9bb1b3a633a40)) - (Lin Yang)
- Add TypeBox parameters and documentation (#35) ([d4b857c](d4b857cb4361a1b89d439bfd1ea5d3e3d67e21c6)) - (Lin Yang)

### 🐛 Bug Fixes

- Correct progressive compatibility documentation ([057ca58](057ca580faa7b417d4945f29044b5a0e69d76dc8)) - (Lin Yang)
- Patch fast-xml-parser stack overflow vulnerability ([8dd2e1b](8dd2e1b355756dcc7f0322539d2081fad8fdda46)) - (Lin Yang)
- Remove duplicate pairing state, delegate to OpenClaw (#36) ([d5e71d8](d5e71d80856d844cff606e55c54a5a4fa1a0492d)) - (Lin Yang)




### ✅ Testing

- Unify E2E test management with shared fixtures ([a598aff](a598aff40ffc9686220bd6c8ba5e741dae6a4eab)) - (Lin Yang)


### 🔨 Build

- Bump lint-staged from 16.2.7 to 16.3.1 (#38) ([e142861](e142861d2bbb65fb47684945e8e2831b62c32da0)) - (dependabot[bot])
- Bump @types/node from 24.10.15 to 24.11.0 (#37) ([5d5e98c](5d5e98c591396147debf92fd8905d52a87f6cd9c)) - (dependabot[bot])

### 📖 Documentation

- Comprehensive architecture.md documentation ([4528209](452820985289e07247c2fddf56c32ef9d0c42974)) - (Lin Yang)
- Optimize and reorganize architecture documentation ([828640c](828640c834c890913ec381002c0576ba26d51a36)) - (Lin Yang)


## 2026.2.28 - 2026-02-28

[d9a3694](d9a369440c483a38ddc3bdb53ae5a0c1079cef52)...[6ed2eaf](6ed2eaffb264507f9de452b3a7c653d7d60f9f09)



### 🚀 Features

- Migrate to OpenClaw 2026.2.26+ bindings mechanism (#31) ([16e84d8](16e84d8fa3b700662d396ba037521c23950b9af3)) - (Lin Yang)

### 🐛 Bug Fixes

- Remove accounts.default to prevent duplicate messages (#32) ([80af540](80af5407a4612360211e2ce1d1d174c06eb58784)) - (Lin Yang)






### 🔨 Build

- Bump rollup in the npm_and_yarn group across 1 directory (#27) ([83f49c8](83f49c8d9c0e76d9b8de346fc7e9811cf5a68564)) - (dependabot[bot])
- Bump minimatch (#30) ([540c519](540c51954f3471c5044ed7a93d9239a5c6b5cbde)) - (dependabot[bot])

### 📖 Documentation

- Add OpenClaw badge to README ([e14fcd5](e14fcd5f327791a260bc58347d02662df00243ba)) - (Lin Yang)
- Enhance README badges with logos ([5d356de](5d356de4c587b5e94abcdefd387a09767309a6c4)) - (Lin Yang)


## 2026.2.27 - 2026-02-27

[fdb4281](fdb428199d5dc319f044d7688c06b4390af8b9d5)...[d9a3694](d9a369440c483a38ddc3bdb53ae5a0c1079cef52)










### 🔨 Build

- Bump @types/node from 24.10.13 to 24.10.15 (#28) ([fa3aaaa](fa3aaaa163bf48dafe7d4ec8ba2b0d0402484920)) - (dependabot[bot])
- Bump openclaw from 2026.2.24 to 2026.2.26 (#29) ([c45c911](c45c911de5f071bc70ea02fa3333e1e67c66d076)) - (dependabot[bot])



## 2026.2.26 - 2026-02-26

[f30219f](f30219ff957a7db983d544b5f2265b8288e2ccff)...[fdb4281](fdb428199d5dc319f044d7688c06b4390af8b9d5)

### 🚨 BREAKING CHANGES

- Add comprehensive documentation coverage ([89c129c](89c129c753ac6b7ede3cb813906cb0d1dbc4bf95)) - (Lin Yang)
- 2026.2.26 ([fdb4281](fdb428199d5dc319f044d7688c06b4390af8b9d5)) - (Lin Yang)




### 🐛 Bug Fixes

- Track and cleanup message retry timers to prevent memory leak (#26) ([b938e38](b938e38e6db413d50878c968457937032e7fa135)) - (Lin Yang)




### ✅ Testing

- Enhance test coverage for gateway and plugin modules ([825a765](825a765e76a37ba445c4ba54f1071442488ed3f2)) - (Lin Yang)


### 🔨 Build

- Bump openclaw from 2026.2.23 to 2026.2.24 (#25) ([f5e232a](f5e232ade60ac7fdb28b3ab07cc1747861dbaf71)) - (dependabot[bot])

### 📖 Documentation

- Update ADR index with new records ([c32c361](c32c3614481f7a6a09f9dc4b3c44dc8fc7dd0060)) - (Lin Yang)


## 2026.2.25 - 2026-02-25

[7c23a9d](7c23a9df91f92ee87ce760bb3dbe931f138bbbba)...[f30219f](f30219ff957a7db983d544b5f2265b8288e2ccff)

### 🚨 BREAKING CHANGES

- Add optional watermarkStore injection for testability ([69c3936](69c393635b532fa06d029801c36eadde29a0efc3)) - (Lin Yang)
- 🐛 fix: use default runtime provider to prevent initialization error ([6603ead](6603ead8d5da52688eb090bede8db668d33f86d7)) - (Eric Lin)
- 🐛 fix: use latest.sender to detect bot's own messages in polling ([62225cf](62225cfa506703d17fd5382f99ca6ffe853ca967)) - (Eric Lin)



### 🚀 Features

- Gateway Pipeline with retry mechanism (#11) ([6f15fee](6f15feeb190e94b240cfc50d28b7b1acfb2796b9)) - (Lin Yang)
- Check username match before joining mesh (#24) ([1e12c9d](1e12c9d5e3d02992670151dcb4af455dd876ada3)) - (Lin Yang)

### 🐛 Bug Fixes

- Correct Mermaid syntax in DI Container diagram ([4b1a773](4b1a773641e29d096c088f20513a465c0debb635)) - (Lin Yang)
- Use getOrDefault fallback for allowFrom to prevent silent failure (#21) ([b384a5e](b384a5e6fd94bc642f9e3e9c99cc7b2d21d7c94c)) - (Lin Yang)
- Handle null/undefined in storeAllowFrom parameter (#23) ([a8632be](a8632be56a218331c4f5317b8865fdf9611064f6)) - (Lin Yang)



### ♻️ Refactor

- Eliminate message processing code duplication with Strategy Pattern (#15) ([8b046ee](8b046eeb91f70acfc18f02ef719eda90af2d87a6)) - (Lin Yang)
- Use discriminated union for getWatermarkKey (#16) ([0bd14c8](0bd14c8cb88d36431317631766e630cb486b7d2d)) - (Lin Yang)
- Consolidate duplicate retry logic (#17) ([7c08b0e](7c08b0e5578f8810c84349ae43eaee34a84266d5)) - (Lin Yang)
- Eliminate service locator from messaging layer (#18) ([267ffbc](267ffbcd1f717c85e1031be8e058e41652622e80)) - (Lin Yang)
- Unify dependency management with DI pattern (#19) ([8c03bcb](8c03bcbc31a9a100a30c6c5fe1c68b4ebcd4409a)) - (Lin Yang)
- Implement API client interface segregation (ISP) (#20) ([7965d86](7965d8631f41d1077275417b677616764ce4c2fd)) - (Lin Yang)
- Clean up debug logs and unused parameters in polling ([ed54169](ed54169b7701810993968784d84f80f3f2c10d8d)) - (Lin Yang)

### ✅ Testing

- Add auth error sanitization test coverage (#22) ([f22097e](f22097ecb6d264c2a6e7e09333db7191457969e9)) - (Lin Yang)



### 📖 Documentation

- Convert JSDoc to TypeDoc format and add documentation generation ([4654294](4654294f4554e1ad86241e1e93bb9980dd75e5df)) - (Lin Yang)
- Add enhanced documentation for developers ([f48c7e9](f48c7e925ea63277e9308a8827a6529a6990ee52)) - (Lin Yang)
- Add source tree analysis and technology stack documentation ([9d247a6](9d247a62ffca2848080887247e3ab186da75eea3)) - (Lin Yang)
- Enhance existing ADRs and add ADR-006 through ADR-013 ([1f01ffc](1f01ffc39f23069769df422560ac49976e86cca7)) - (Lin Yang)
- Delete docs/plans directory ([28e99dd](28e99dd4d792ad220b63fff32f7d2b66983bb872)) - (Lin Yang)
- Add 7 new Architecture Decision Records ([b3e1a26](b3e1a26c63f2be85b00ea7b1af74a41e746fb09b)) - (Lin Yang)

### 🔧 Miscellaneous Tasks

- Update GitHub Actions workflow permissions ([a1b0cbb](a1b0cbb0766083c3571094f6934b2df5016ebd99)) - (Lin Yang)
- Add lint step to test and release workflows ([e75decf](e75decf01d1408e361935f4221b0704e029aa862)) - (Lin Yang)

## 2026.2.23 - 2026-02-23

[b5645d1](b5645d13cf1397a320de0ff565f3c609ef7f0223)...[7c23a9d](7c23a9df91f92ee87ce760bb3dbe931f138bbbba)



### 🚀 Features

- Support Unicode characters in usernames ([3be83c3](3be83c3b3c9d87c480458b9cc012a038d32ef52b)) - (Lin Yang)
- Add validateGroupName for Unicode group names ([97c5248](97c5248288cc7ffc74e96d5e02da8fb4488e78e3)) - (Lin Yang)
- Validate Unicode group names in watchChanges ([bb3e49e](bb3e49eacb187bd134438abbf7989cba855cfb62)) - (Lin Yang)
- Skip groups with invalid names in watchChanges ([95f052d](95f052daecda7163ed79d038f1ca13a234bf81a1)) - (Lin Yang)
- Limit initial sync to 5 minutes of history ([c57b42c](c57b42c02f56906b004e9d6486fe23eb3556240d)) - (Lin Yang)
- Add per-account file isolation for state and permit storage ([34ae2f9](34ae2f99b19e83cc57f70fda9102266641968b2d)) - (Lin Yang)

### 🐛 Bug Fixes

- Propagate message processing errors to caller in watcher ([6bf7370](6bf73701dd5531a578715c4d1e4b9a0a601e3bd9)) - (Lin Yang)
- Replace magic number with API_TIMEOUT_MS constant ([971931f](971931f7630ab3c5cb06144f32e27f0639b9f7db)) - (Lin Yang)
- Use underscore prefix for unused parameters per ESLint rule ([a61e43d](a61e43d11c72e87784501ce49b9559ce77933166)) - (Lin Yang)
- Schedule full sync only on activity transition ([887d66d](887d66d85cdadddb95c55cc3d11a89119f7c0d66)) - (Lin Yang)
- Add max queue size limit to Semaphore ([cbd0752](cbd075284fd09526da1ff344f89bb872968fbd57)) - (Lin Yang)
- Resolve test failures and add field comments to http-server.ts ([22f0472](22f0472532409855a25a6f30a88ee4b5221e167b)) - (Lin Yang)
- Resolve ESLint unused variable errors ([2fd3f31](2fd3f318fea86cfb49047f47c5dc37330ca04b06)) - (Lin Yang)

### 🔒 Security

- Add path traversal validation for permitFilePath ([ab95704](ab957044dc70a0ca4e6493fa80ce18943edecbcb)) - (Lin Yang)
- Prevent cache stampede in AccountStateManager ([9ab6da5](9ab6da59c3cdffa71cb3a226faf2cc5fd763ecc3)) - (Lin Yang)

### ⚡ Performance

- Optimize cache eviction to O(1) ([2386a84](2386a84e6e5259942f546cee22278bbba69cc76b)) - (Lin Yang)

### ♻️ Refactor

- Use normalizeUsername utility in dm-policy.ts ([c2a530e](c2a530e6a6bc73254d815dbe5e2d7267907458c7)) - (Lin Yang)
- Add isPeerChat helper for peer/group chat classification ([8afec4c](8afec4c8ed9063c84ae5731cac6b0a0485f8ca98)) - (Lin Yang)
- Extract helper functions to reduce startAccountGateway complexity ([73b5065](73b5065404c24cd94d2e96a81ed0af9a73dad137)) - (Lin Yang)
- Extract nested callbacks in WatchLoopController ([835d192](835d192f22f815f96cab1cc7d02d9edefade12e1)) - (Lin Yang)
- Extract buildResolvedConfig from validateZTMChatConfig ([eafd230](eafd230a3f40cc13cd4c413c14295208b6eb0711)) - (Lin Yang)
- Reduce feature envy in processAndNotifyChat ([2029af2](2029af277ee997555dc446a6a47262aa9e86cad7)) - (Lin Yang)
- Use DI container consistently for singleton services ([a978486](a978486e63272b2e856689293508ab2cdd71d827)) - (Lin Yang)
- Simplify plugin status model and remove mesh health monitoring ([733efc0](733efc064b4df0838faf4e42e90f8eb4f65e8bae)) - (Eric Lin)
- Remove fileMetadata tracking - messages now via Chat API only ([ada01ce](ada01cedddafa851b2119f9e4167af62c7730513)) - (Lin Yang)
- Remove unused autoReply and messagePath config fields ([ea72d4e](ea72d4eeb2e559957ea8b05900637098acda5076)) - (Lin Yang)
- Remove backward compatibility code ([d1a5119](d1a5119b73843eb5b25a93f7cf0b7bfe4148b589)) - (Lin Yang)

### ✅ Testing

- Add index.ts tests and include in coverage ([15d0e4f](15d0e4f684c9d6df257e1599915544bd11f8c2fe)) - (Lin Yang)
- Add tests for DI factories and cache TTL behavior ([5b894e7](5b894e7f10e6e8a2fc11eda233ccbcb29177a1aa)) - (Lin Yang)
- Add error handling tests for watcher.ts ([9e74461](9e7446148e71bc5aa279daa840c34c9485e57f03)) - (Lin Yang)
- Add error handling tests for gateway.ts ([0a4bb38](0a4bb3879aaaf40af6d5257446359aea19f65903)) - (Lin Yang)
- Add WatchLoopController behavior tests ([e8ca4e2](e8ca4e2bccbd04f47e83bd10a8375043c6afb769)) - (Lin Yang)
- Improve DI container test coverage ([12a9fbe](12a9fbe8238cd98c7e49dca0c3d02897a00ebd71)) - (Lin Yang)
- Implement real integration test architecture improvement ([7479fa9](7479fa96a0071b15020153b8ed73394ef37fe1ba)) - (Lin Yang)
- Add cache stampede prevention tests to AccountStateManager ([bbc02aa](bbc02aa95ad614f3efb449f797d6806e28a16573)) - (Lin Yang)
- Add network error path integration tests ([e97efbf](e97efbfd548a93a76984c1841207cc4c958ec3fa)) - (Lin Yang)
- Extend http-server.ts with delay and error injection for E2E tests ([9f07f56](9f07f562eacf9a2a791d61e602660dfbc9fe5f2e)) - (Lin Yang)
- Create E2E test directories ([61bde2f](61bde2f12f7451d1baa0cce15df94ad2e9fac6ad)) - (Lin Yang)
- Add remaining E2E tests ([915986c](915986cbeca1ae33ddb608f34889f4820d1d236e)) - (Lin Yang)
- Add E2E test for message flow ([331d0f3](331d0f354cf1466dae80a52acab2886a2b2eee5e)) - (Lin Yang)
- Fix connection error test for Bun compatibility ([d41b9bd](d41b9bd896e8b07a8e36241d686a36e92bc1b6fe)) - (Lin Yang)
- Add more Unicode language tests ([fe53bd3](fe53bd39db0d3f13d7c173428d7d7809ea7134a1)) - (Lin Yang)
- Update API tests for Unicode usernames and group names ([a001b34](a001b343009755efa4cad40598901e8ead4737c9)) - (Lin Yang)
- Add comprehensive test coverage for security, boundaries, and E2E scenarios ([ce7c180](ce7c180ad76c9caaeaf0255c23b402d869ba2a89)) - (Lin Yang)
- Optimize pre-commit to run unit tests only, add E2E test fixes ([8c07bcd](8c07bcd7038f0172fa13ec92c8173f1b523d6e68)) - (Lin Yang)

### 💄 Styling

- Apply Prettier formatting to all project files ([ca66c1e](ca66c1e901fc2b0168ab7c5b6e3398c03b8961ce)) - (Lin Yang)

### 🔨 Build

- Add esbuild for npm package publishing ([4ff440d](4ff440de6ea9101b972439427c3c758b8d3dfbb4)) - (Lin Yang)

### 📖 Documentation

- Add SECURITY.md with vulnerability reporting policy ([ace1d1c](ace1d1ce9f52c15961bc40bb213ce37404005fc5)) - (Lin Yang)
- Add CODE_OF_CONDUCT.md based on Contributor Covenant ([6713425](6713425d62e2e52569eecf739bb7ee7f919a3566)) - (Lin Yang)
- Add CONTRIBUTING.md with development guidelines ([b44e2d2](b44e2d2d4047b323d876481e31a301357c0d060e)) - (Lin Yang)
- Add GitHub issue and PR templates ([5f02c70](5f02c70996613a0f429e11789ec7236428afe601)) - (Lin Yang)
- Use dynamic codecov badge instead of static ([86d574c](86d574c12dec9405ab2e966135bf4b99e78dedae)) - (Lin Yang)
- Clarify getAllowFromCache return value semantics ([a32c43f](a32c43f503ea976f75ed4e536cc79edd95a462b2)) - (Lin Yang)
- Complete JSDoc comments with @param and @returns tags ([01171a1](01171a15915a15567fd8b7d614515484eb6c3124)) - (Lin Yang)
- Add JSDoc to IGroupPermissionCache interface ([141a76b](141a76b724b83e315a2da6b5d49fbb5bd91d2017)) - (Lin Yang)
- Add Architecture Decision Records (ADR) ([77e0b0d](77e0b0d691492504c279e633d7ecce133a8a0f97)) - (Lin Yang)
- Add API documentation ([93fa1cc](93fa1cc61514458f25e104792a468a5b1772dcee)) - (Lin Yang)
- Convert Error Flow Diagram to Mermaid format ([e205644](e205644e666fa13dcec4a6566f951902a94d2ec0)) - (Lin Yang)
- Add comprehensive JSDoc comments to all source files ([ee52a8d](ee52a8d0c6de0e04aad967395407d4f0ea79f68c)) - (Lin Yang)


## 2026.2.20-rc.3 - 2026-02-19

[0e727cd](0e727cd79176e0dd2e749b6009d995ebfc375261)...[b5645d1](b5645d13cf1397a320de0ff565f3c609ef7f0223)




### 🐛 Bug Fixes

- Properly handle Promise rejection in inbound message handler ([601e60f](601e60f6fcff295ee83627605a5d0f258e340f07)) - (Lin Yang)
- Provide valid default config in createEmptyState ([94aa6b8](94aa6b87b535594a3b318a331f9caf8aba75792a)) - (Lin Yang)
- Add defaultLogger to dispatcher test mock ([a7a54eb](a7a54eb8941b32a0a35dfa8651a0e3ce3b78254e)) - (Lin Yang)
- Restore missing typecheck and tests in pre-commit hook ([1cf2446](1cf2446e38b4eb9fb92d36fc32b5d91550a0c7e6)) - (Lin Yang)
- Add retry mechanism for failed inbound messages ([e59c642](e59c64220cd54a6756dde0eb875845bea22e00cf)) - (Lin Yang)
- Add path traversal validation for permitFilePath ([c4072da](c4072da41386522c689d7dc251667981ca3dae10)) - (Lin Yang)
- Add HTML escaping for message content to prevent XSS ([a1a0edc](a1a0edcc37842e5f0615f59c4f5c400230cc28ba)) - (Lin Yang)
- Add peer parameter validation to prevent injection attacks ([c6e7817](c6e7817acf9b562bf2d5924b25cbc85ed451390d)) - (Lin Yang)
- Eliminate race condition in semaphore timeout handling ([0dc763f](0dc763f1635881a5b5552a607ebcb28b409f4814)) - (Lin Yang)
- Add schema validation for state file deserialization ([cc8d2b3](cc8d2b358b77e641820a40feca40dae33cc50ec0)) - (Lin Yang)
- Add path traversal validation for file metadata ([b6693c0](b6693c016d0fbac4fbdf2b6e9e525170f40356ec)) - (Lin Yang)
- Resolve critical performance and concurrency issues ([af026e5](af026e50bc3edc7a9221fba60080ce748eea6de8)) - (Lin Yang)
- Track pending pairings to prevent duplicate requests ([158abf2](158abf2bb45c958bae835cb5b7255756c1672ede)) - (Lin Yang)

### 🔒 Security

- Add path traversal validation in path resolution ([2675e90](2675e90d0d2bfd75147f398e5ff171d9ac88cecd)) - (Lin Yang)


### ♻️ Refactor

- Break down startAccountGateway into smaller focused functions ([92fe1d4](92fe1d44edaac2999d950a435e082467c7641a4a)) - (Lin Yang)
- Extract duplicate message validation logic into shared functions ([3bafed8](3bafed82ea7be422858e9fd9eacf30014bbc44c8)) - (Lin Yang)
- Extract duplicate watermark key generation into shared function ([99aab88](99aab88def58bdf2a6bab520318530cd50525e50)) - (Lin Yang)
- Add DI helper functions and fix test mocks ([0066d22](0066d229668d1e1ca7a7c1cc40cf7382e06e0c4d)) - (Lin Yang)
- Flatten nested callbacks in buildMessageCallback ([deea846](deea8464860ee5c70b4e508dac0c67d590750253)) - (Lin Yang)
- Eliminate GroupPolicy type duplication ([7b877ad](7b877ad2f24d8e96a3b5e8b94b40b0c6bf121e15)) - (Lin Yang)
- Remove unnecessary type assertions in plugin.ts ([5fa9302](5fa930255c2f3ebeff6198a17bad8144cc80c258)) - (Lin Yang)
- Extract directory and status modules from plugin.ts ([18b4084](18b40841ff22e4157b1c1d9fccbe769544f8f824)) - (Lin Yang)
- Introduce MessagingContext to eliminate cross-layer dependencies ([c1209ee](c1209ee40543de36f9ffa55a0e6db37ac052090f)) - (Lin Yang)

### ✅ Testing

- Add empty config validation tests ([e99d640](e99d6403fa6d672489f69d296e517ecad70c2b7c)) - (Lin Yang)
- Add XSS prevention tests for message content ([b569f11](b569f1141b14350284395ff9638709494f6a220a)) - (Lin Yang)
- Add concurrent watermark update tests ([a512f27](a512f270083b37e60649be0eef4b800b9ab0fb0b)) - (Lin Yang)
- Add additional security and performance tests ([b5b728e](b5b728eaf21e6b26b2a9f65196b83936ecccf3f0)) - (Lin Yang)
- Add callback semaphore blocking tests ([d30f2cb](d30f2cb4f24066e3915314594027a1c62310d851)) - (Lin Yang)
- Add input sanitization tests for processor ([2247453](2247453b157cbfeba8dbfa3e59a4d95008345224)) - (Lin Yang)
- Add pairing flow expiration tests ([8b6153a](8b6153ad8ac3029fa440d36d47a4c2b1ccf48a26)) - (Lin Yang)
- Add filter operation efficiency tests ([d7fd259](d7fd259485a155f7b10c13827f111653b2f085bd)) - (Lin Yang)
- Add concurrent state modification tests ([570a1fc](570a1fc486591339e740f592b21516b0ad8fd861)) - (Lin Yang)
- Add API retry storm protection tests ([6b73022](6b73022f74fe9e4d328fd1e455def51c38f0a46a)) - (Lin Yang)
- Add unit tests for guards and error utilities ([f8dca60](f8dca60461d7f5fe3d7454220eb6e697d2c3620a)) - (Lin Yang)
- Add unit tests for repository implementations ([7a89aad](7a89aaddb391ad8cb499265704e5a8919548b1f5)) - (Lin Yang)
- Add unit tests for directory, status, and message-processor-helpers ([a3e68a9](a3e68a95d1f6abcd7ca8d3af348ece03a4b2d266)) - (Lin Yang)
- Add unit tests for polling watcher fallback ([3addd85](3addd85051ba1f77a7270af3e8be9749c5a3ebdf)) - (Lin Yang)
- Add integration tests and fix naming conventions ([7558f16](7558f164b500d8cae95dfe31ae4464aac4afc77f)) - (Lin Yang)
- Add missing integration and unit tests ([0627899](06278997db1b75353c7c1683bb12964d540e5a6a)) - (Lin Yang)
- Restore logger tests to reach 1871 total ([97420f9](97420f906b933e279a6cfe8c9df6c7f134431fde)) - (Lin Yang)
- Add test:coverage script and update CI/workflows ([29902fe](29902fecc3b088d98b2a090537986f8ed546ce6b)) - (Lin Yang)
- Fix flaky watermark race condition test ([257e026](257e02644d0322246d602467ba234f80a148fa8f)) - (Lin Yang)



### 📖 Documentation

- Clarify AccountStateManager state ownership in state.ts ([9491433](9491433a25631bbbb9210b3faf4be2147b0d1b32)) - (Lin Yang)
- Fix npm command syntax in workflow and README ([bc66fbb](bc66fbbd92f087e068e8d5c46839256c632f874b)) - (Lin Yang)

### 🔧 Miscellaneous Tasks

- Upgrade codecov-action from v4 to v5 ([d3d232e](d3d232e471bd2829fa28a2fd5252767dda44240f)) - (Lin Yang)

## 2026.2.18-rc.3 - 2026-02-18

[3fccdae](3fccdae0eb2706a0e210a9bb50572a3e069f1bc8)...[0e727cd](0e727cd79176e0dd2e749b6009d995ebfc375261)

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
- Generate changelog based on tag type ([8b2f23b](8b2f23bd83f34ab06cb6fe39fd63dcc7790243ef)) - (Lin Yang)

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
- Hide empty changelog groups and only show non-empty sections ([d64b37f](d64b37fd803d24dcb2c3a56279c78fc7b5b6ff89)) - (Lin Yang)
- Use git-cliff binary directly instead of action ([54634d2](54634d2887bcf51dd313dbcc32729aca96baee30)) - (Lin Yang)
- Use correct git-cliff range syntax ([9d6b99a](9d6b99a69a168367c2a3038a9d64f42a823e473e)) - (Lin Yang)
- Detect CPU architecture when downloading git-cliff binary ([df46502](df46502b5c3c120498efc3743f845ec9594f2359)) - (Lin Yang)
- Use taiki-e install-action for git-cliff ([032b2bc](032b2bcefd13ec0b81113671d9dd1e9f1fe572e9)) - (Lin Yang)

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

- Add Dependabot for automated dependency updates ([2b39237](2b39237df0b82d00967f6505dfcbfa0e4323a988)) - (Lin Yang)

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

- Add GitHub Actions test workflow (#1) ([d99d8e2](d99d8e2ab1608a3245da56d648cee688da9d404f)) - (Lin Yang)

<!-- generated by git-cliff -->
