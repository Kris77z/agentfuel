# Video update — 2026-10-15

## Published videos and preserved submission

The two supplied video files were uploaded to the existing Jungle YouTube channel as **unlisted** videos: anyone with the link can watch. They are dated updates, separate from the original submitted overview.

| Material | Published link | Source duration / bytes |
| --- | --- | --- |
| Pitch | [Compete for Compute](https://youtu.be/pOUE6yWpGg4) | `tabby-promo-v6-no-chain.mp4`: 49 seconds / 45,620,387 bytes |
| Technical demo | [Technical Demo](https://youtu.be/Hgs1R7LrMZU) | `tabby-demo-v2.mp4`: 110.766667 seconds / 30,513,117 bytes |
| Original submitted overview | [Original video](https://youtu.be/9Xxnqi52Kvo) | Original upload and URL retained |

The original video's description now starts with both new video links. Its saved end screen links to the new technical demo and pitch from 20 seconds to the end. The software demonstration's audience classification was corrected from made for kids to not made for kids to support this end screen. Its original video, title, public visibility and URL remain intact. The locked hackathon submission fields were not changed, and no organizer message or support ticket was sent.

Both READMEs feature a **native inline Pitch player**, the technical-demo link, the website gallery and the original submitted overview. The [public GitHub video attachment](https://github.com/user-attachments/assets/da18320d-eea4-45c6-9d01-be43866f0041) is a 49.002-second H.264/AAC 1280×720 copy, 9,322,465 bytes; the original high-resolution files were retained. After associating the web-uploaded attachment through GitHub's README editor, an unauthenticated range GET returned **206 / video/mp4**, and browser playback advanced to 34 seconds. No issue, PR, comment or release was created for attachment hosting.

Source SHA-256 values:

```text
Pitch original  5a49283bf2f84f297318ac70051ac5540e3c7e6cb12dc6f4854a1713e1b86a81
Demo original   5801adc10c397278b28ea213594f2119817d2417f11d5f97ecafaa97393815ec
Pitch inline    04c3535a6559cfad206bb5edba925850482bb06030480f95547942121688a149
```

## Frontend and browser verification

Frontend TypeScript checking and whitespace checks passed. Eight controlled UI checks covered home links, deep links, language selection, keyboard access, a 390px mobile layout without horizontal overflow, zero external player requests before loading, a single deferred iframe, and removal of the previous player when switching videos. Those controlled checks intercepted YouTube requests and did not establish real playback.

Separately, the deployed Chinese Pitch page loaded the actual YouTube player and completed playback at **49 / 49 seconds**. The technical demo's actual embedded player advanced to **41 seconds**; its selected video, language-switch links and external watch link all matched `Hgs1R7LrMZU`. GitHub native Pitch playback and its anonymous media access were verified separately as recorded above.

## Production frontend deployment

The Monad frontend was updated on 2026-10-15. The before/after checks ran at **12:50:18–12:57:43 UTC** (20:50:18–20:57:43 UTC+8). This was a frontend deployment with read-only production checks; it did not create Agents, dispatch models, resume work, make payments or broadcast transactions.

Exactly six frontend source files were transferred to the existing Monad checkout:

- [Video catalog](../frontend/lib/project-videos.ts)
- [Watch route](../frontend/app/watch/page.tsx)
- [Player component](../frontend/components/watch/video-player.tsx)
- [Watch styles](../frontend/components/watch/watch.module.css)
- [Landing component](../frontend/components/landing/landing-page.tsx)
- [Landing styles](../frontend/components/landing/landing.module.css)

The VPS build completed successfully with `npm run build --workspace @agentfuel/frontend`, using the existing production environment and a fresh `NEXT_DIST_DIR`. The generated app route manifest contained `/watch/page`; all six deployed source checksums matched the local files. Only `NEXT_DIST_DIR` changed in `/etc/tabby-monad/frontend.env`; its other bytes were preserved. Only `tabby-monad-frontend` was restarted after the successful build. No units, nginx configuration, runtime files or gateway state were replaced.

| Build | Before | After |
| --- | --- | --- |
| `NEXT_DIST_DIR` | `.next-monad-vps-rpcfix` | `.next-monad-vps-video-20261015T125137Z` |
| Next build ID | `wWfR78R3atSSNK9gEQmsH` | `5RLDWEWWQBnIZZF1sSNY_` |

The prior build and a private backup of the frontend environment and two replaced landing source files were retained for rollback. The first build invocation stopped before compilation because its command search path omitted `runuser`; rerunning with the absolute executable path completed the build. No service was switched during that failed invocation.

### Public route checks

All route checks below used anonymous HTTP GET requests against the deployed HTTPS origin. `/watch` had returned 404 before this deployment.

| Route | Observed result |
| --- | --- |
| [English home](https://monad.tabbyai.xyz/?lang=en) | HTTP 200; links to both English video pages |
| [Chinese home](https://monad.tabbyai.xyz/?lang=zh) | HTTP 200; links to both Chinese video pages |
| [English pitch](https://monad.tabbyai.xyz/watch?lang=en&video=pitch) | HTTP 200; selected YouTube ID `pOUE6yWpGg4`; English locale |
| [Chinese pitch](https://monad.tabbyai.xyz/watch?lang=zh&video=pitch) | HTTP 200; selected YouTube ID `pOUE6yWpGg4`; Chinese locale |
| [English technical demo](https://monad.tabbyai.xyz/watch?lang=en&video=technical-demo) | HTTP 200; selected YouTube ID `Hgs1R7LrMZU`; English locale |
| [Chinese technical demo](https://monad.tabbyai.xyz/watch?lang=zh&video=technical-demo) | HTTP 200; selected YouTube ID `Hgs1R7LrMZU`; Chinese locale |
| [Default watch page](https://monad.tabbyai.xyz/watch) | HTTP 200; pitch selected |
| `/api/hosted/agents` | HTTP 401 with `HOSTED_AUTH_REQUIRED` |
| [Existing Tempo dashboard](https://tempo.tabbyai.xyz/dashboard) | HTTP 200; response size unchanged at 26,512 bytes |

The initial server HTML for all five watch-page requests contained zero iframes. The player source mounts the YouTube privacy-enhanced iframe only after the viewer requests it, with `autoplay=0`. These production HTTP checks verify routing, selected video IDs and localization; they do not establish provider-hosted playback or YouTube visibility.

### Service and business-state preservation

All six units were `active/running` after the deployment. Their `NRestarts` counters remained zero; the planned frontend restart is shown by its changed PID and start time.

| Unit | Before PID | After PID |
| --- | ---: | ---: |
| `tabby-monad-gateway` | 138263 | 138263 |
| `tabby-monad-runtime` | 138312 | 138312 |
| `tabby-monad-frontend` | 138492 | 144145 |
| `tabby-tempo-gateway` | 109723 | 109723 |
| `tabby-tempo-runtime` | 109778 | 109778 |
| `tabby-tempo-frontend` | 109934 | 109934 |

The five unchanged processes also retained their original start timestamps. The new Monad frontend started at **12:56:51 UTC**. The gateway health endpoint remained HTTP 200 and ready, advertising the same two models.

| Observation | Before | After |
| --- | ---: | ---: |
| Gateway `acceptedRequests` | 123 | 123 |
| Hosted Agents | 9 | 9 |
| Hosted runs | 48 | 48 |
| Succeeded / Failed / Paused runs | 34 / 11 / 3 | 34 / 11 / 3 |

The hosted database bytes were identical before and after the deployment: SHA-256 `3ca329ff1c3ba283cbd7e84c66be1b954e630c34c144f13dc7d314d086a50d41`. Existing paused work stayed paused. These observations establish that this video-page deployment added no hosted runs or accepted model calls during the recorded check window; they are not a new game, task, credit or payment acceptance.
