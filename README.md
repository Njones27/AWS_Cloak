# AWS Cloak

AWS Cloak is a Chrome extension that blurs sensitive information in the AWS console so you can record workshop walkthroughs without censoring the video by hand afterwards.

It watches every console page as it loads and blurs account IDs, ARNs, resource IDs, access keys, IP addresses, URLs and your account alias. Anything it misses can be hidden with a hover and a click, the same way Safari's Hide Distracting Items works.

## Install it

Chrome lets you load an extension straight from a folder, which is called loading it unpacked.

1. Download this repository. Either clone it with `git clone https://github.com/Njones27/AWS_Cloak.git` or use the green Code button on GitHub and pick Download ZIP, then unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on Developer mode with the switch in the top right corner.
4. Click Load unpacked and choose the `AWS_Cloak` folder, which is the one that contains `manifest.json`.
5. Click the puzzle piece icon in the toolbar and pin AWS Cloak so its icon is always visible.
6. Reload any AWS console tabs that were already open.

When you pull new changes later, go back to `chrome://extensions` and click the reload arrow on the AWS Cloak card.

## Use it

Blurring is on as soon as the extension is installed. Open the AWS console and IDs should already be blurred.

**Turning it on and off.** Click the AWS Cloak icon and use the Blur sensitive info switch, or press `Alt+Shift+B` on any page. This only pauses the blurring, so you never need to disable the whole extension. The icon shows a red OFF badge whenever blurring is paused, which makes it easy to check before you hit record.

**Hiding anything else.** Click the icon and choose Pick items to hide, or press `Alt+Shift+P`. Move the mouse around the page and an orange box outlines whatever is under it. Click to blur that item on this page, or hold Shift while clicking to blur it on every AWS page. Press the up arrow to grow the box to the surrounding area and the down arrow to shrink it again. Clicking something you already blurred shows it again. Press Esc or click Done when you are finished.

Your picks are saved, so they come back after a reload and in every region. Picks are remembered per service, which means something you hide in Lambda stays hidden in Lambda but does not affect S3. Use Clear picks on this page or Clear all picks in the popup to start over.

**Options in the popup.**

* Strict mode also blurs any word that mixes letters and numbers, such as resource names like `build42`. Region names such as `us-east-1` stay readable. Turn this on if you want to be extra careful.
* Mask tab titles replaces IDs in the browser tab title with dots.
* Blur strength makes the blur lighter or heavier.

You can change either keyboard shortcut from the link at the bottom of the popup, or at `chrome://extensions/shortcuts`.

## What gets blurred

These values are found automatically wherever they show up in the page text or in a text box.

* Account IDs, written either as `123456789012` or `1234-5678-9012`
* ARNs for every service
* Resource IDs with a prefix, for example EC2 instances, volumes, AMIs, security groups, subnets, VPCs, ENIs, transit gateways, Identity Center instances and identity store IDs
* Uppercase and lowercase generated IDs, which covers CloudFront distributions, Route 53 hosted zones, API Gateway APIs, Bedrock agents and knowledge bases, IAM unique IDs and similar
* UUIDs, long hex strings and long numbers
* Access key IDs and anything that looks like a secret access key
* IPv4 and IPv6 addresses and CIDR ranges
* Every full URL, including AWS access portal start URLs, Lambda function URLs and API Gateway invoke URLs
* Hostnames on AWS domains such as `awsapps.com`, `amazonaws.com`, `cloudfront.net` and `on.aws`
* Email addresses
* Cognito user pool IDs

The account menu in the top right of the console is always blurred, which hides the account alias, user or role name and account ID.

When a sensitive value sits in a short label or table cell, the whole cell is blurred. When it sits inside a long paragraph, only the value is blurred so the rest of the sentence stays readable.

The extension works on every AWS console page, so it covers Lambda, API Gateway, CloudFormation, Bedrock, S3, DynamoDB, CloudFront, Route 53, IAM, IAM Identity Center, EC2, VPC, RDS, ECS, EKS, SNS, SQS, Step Functions, CloudWatch, Secrets Manager, KMS, Cognito and the rest of the console. It also runs on the AWS access portal at `awsapps.com` and `app.aws`, and on the GovCloud and China consoles.

## Limits to know about

* Chrome does not let extensions change the address bar, so the URL at the top of the window is never blurred. Hide it by recording only the page area, or by using a separate window in full screen with `Cmd+Shift+F` on a Mac or `F11` on Windows.
* Things the extension cannot see, such as browser menus, downloads and other apps, are not blurred.
* Detection is based on patterns, so a value that does not look like an ID, for example a plain bucket or function name, stays visible unless you turn on strict mode or hide it with the picker.
* Before recording, scroll through the pages you plan to show once to make sure everything you care about is covered.

## How it works

The extension uses Manifest V3. A content script runs on AWS pages as soon as they start loading. Because the console is a single page app that keeps adding content, a `MutationObserver` checks every change and blurs new values before the browser draws them, so nothing flashes on screen first. Short elements get a CSS `filter: blur()` through a data attribute, and values inside long text are blurred with the CSS Custom Highlight API so the page's own markup is never rewritten. Settings and picks are kept in `chrome.storage.local`, and the service worker handles the keyboard shortcuts and the toolbar badge.

```
manifest.json        extension definition, permissions and shortcuts
src/patterns.js      the patterns that decide what is sensitive
src/content.js       blurring, the picker and the tab title mask
src/content.css      blur styles and the picker overlay
src/background.js    shortcuts, badge and picker messages
popup/               the toolbar popup
tests/               pattern tests and an end to end test
```

## Running the tests

The pattern tests only need Node.

```
node tests/patterns.test.js
```

The end to end test loads the extension in Chromium with Playwright and serves a mock console page at a real console URL.

```
npm install playwright
npx playwright install chromium
node tests/e2e.js
```

## License

GPL 3.0, see `LICENSE`.

## Releasing

CI runs the pattern tests and builds the store zip on every pull request. To build the zip yourself, run `scripts/package.sh` and it lands in `dist/`. The steps for publishing a new version and the text for the Chrome Web Store listing are in [store/listing.md](store/listing.md). The privacy policy is in [PRIVACY.md](PRIVACY.md).
