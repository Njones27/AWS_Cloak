# Chrome Web Store listing draft

Copy these into the matching fields of the Chrome Web Store developer dashboard.

## Store listing tab

**Name.** AWS Cloak

**Summary**, which is limited to 132 characters.

> Blurs account IDs, ARNs, resource IDs, keys, IPs and URLs in the AWS console so you can record walkthroughs without editing later.

**Category.** Developer Tools

**Language.** English

**Description.**

> AWS Cloak blurs sensitive information in the AWS console while you work, so you can record workshop walkthroughs, demos and tutorials without censoring the video afterwards.
>
> It blurs account IDs, ARNs for every service, EC2 and VPC resource IDs, IAM unique IDs, access keys, IP addresses and CIDR ranges, full URLs including access portal start URLs, Lambda function URLs and API Gateway invoke URLs, email addresses and the account menu in the top right of the console.
>
> New content is blurred before the browser draws it, so nothing flashes on screen first.
>
> Anything it misses can be hidden with the picker. Press Alt+Shift+P, hover over an item and click to blur it. Your picks are remembered per service and work in every region.
>
> Press Alt+Shift+B to pause and resume blurring without turning off the extension. A red OFF badge shows when blurring is paused, so you can check before you hit record.
>
> Options include strict mode for blurring resource names that mix letters and numbers, masking IDs in the tab title and adjusting blur strength.
>
> AWS Cloak runs only on AWS console domains, collects no data and makes no network requests. Your settings stay on your computer.
>
> AWS Cloak is an independent project and is not made by or affiliated with Amazon Web Services.

**Graphics.**

* Icon is `icons/icon128.png`.
* At least one screenshot at 1280 by 800 or 640 by 400. Good choices are the IAM users list with blur on, an EC2 instance page, and the popup open over the console.
* Small promo tile at 440 by 280.

## Privacy practices tab

**Single purpose.**

> AWS Cloak blurs sensitive values such as account IDs, resource IDs and URLs on AWS console pages so users can record or share their screen safely.

**Permission justification for storage.**

> Storage saves the user's settings, such as whether blurring is on and how strong it is, and the page elements they chose to hide with the picker. Everything stays in local extension storage on the user's device.

**Host permission justification.**

> The content script runs only on AWS console domains, including aws.amazon.com, the access portal on awsapps.com and app.aws, and the GovCloud and China consoles. It needs to read and style the page on these sites to find and blur sensitive values. It does not run on any other site.

**Remote code.** No, the extension does not use remote code.

**Data usage.** Leave every data type unchecked, because the extension collects none. Then tick the three certifications that data is not sold, not used for unrelated purposes and not used for credit decisions.

**Privacy policy URL.**

> https://github.com/Njones27/AWS_Cloak/blob/main/PRIVACY.md

## Distribution tab

Visibility can start as Unlisted, which lets anyone with the link install it while it stays out of search. Switch to Public once you are happy with it.

## Releasing a new version

1. Raise `version` in `manifest.json`, for example to 1.0.1.
2. Merge to main, then tag the commit with `git tag v1.0.1` and `git push origin v1.0.1`.
3. The CI workflow checks the tag matches the manifest, runs the tests and attaches the zip to a GitHub release.
4. Download that zip and upload it under Package in the developer dashboard.
