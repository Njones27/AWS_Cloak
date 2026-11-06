// Patterns for values that should never show up in a recording.
// Loaded as a content script before content.js, and also usable from Node for tests.
(function (root) {
  'use strict';

  // Values that are always blurred.
  const STANDARD = {
    // Any full URL, for example an AWS access portal start URL.
    url: String.raw`https?:\/\/[^\s"'<>()]+`,
    // Bare hostnames on AWS owned domains, for example d-1234567890.awsapps.com.
    awsHost: String.raw`\b[a-z0-9][a-z0-9.-]*\.(?:amazonaws\.com(?:\.cn)?|awsapps\.com|cloudfront\.net|on\.aws|app\.aws|amazoncognito\.com|elasticbeanstalk\.com|awsglobalaccelerator\.com|amplifyapp\.com)(?:\/[^\s"'<>()]*)?`,
    arn: String.raw`\barn:aws[a-z-]*:[^\s"'<>]+`,
    email: String.raw`\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b`,
    accessKeyId: String.raw`\b(?:AKIA|ASIA|AROA|AIDA|ANPA|ANVA|AGPA|AIPA|APKA|ABIA|ACCA|A3T[A-Z0-9])[A-Z0-9]{16}\b`,
    secretKey: String.raw`(?<![A-Za-z0-9/+])(?=[A-Za-z0-9/+]*[0-9])(?=[A-Za-z0-9/+]*[a-z])(?=[A-Za-z0-9/+]*[A-Z])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])`,
    uuid: String.raw`\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b`,
    accountIdDashed: String.raw`\b\d{4}-\d{4}-\d{4}\b`,
    accountId: String.raw`(?<![\d-])\d{12}(?![\d-])`,
    // Prefixed resource IDs: i-0abc..., vol-..., sg-..., subnet-..., tgw-attach-..., ssoins-..., d-1234567890
    resourceId: String.raw`\b[a-z][a-z0-9]{0,15}(?:-[a-z0-9]{1,15})?-(?=[0-9a-f]*[0-9])[0-9a-f]{8,32}\b`,
    cognitoPool: String.raw`\b[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]{6,}\b`,
    ipv4: String.raw`\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?:\/\d{1,2})?\b`,
    ipv6Full: String.raw`\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b`,
    ipv6Short: String.raw`\b(?:[0-9a-fA-F]{1,4}:){1,6}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?(?:\/\d{1,3})?`,
    // CloudFront distributions, Route 53 zones, Bedrock agents, IAM unique IDs and similar.
    upperId: String.raw`\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,32}\b`,
    // API Gateway, AppSync and similar lowercase IDs.
    lowerId: String.raw`\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{10,32}\b`,
    longHex: String.raw`\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{16,}\b`,
    longNumber: String.raw`(?<![\d.])\d{8,}(?![\d.])`,
  };

  // Extra patterns for strict mode, which blurs anything that mixes letters and numbers.
  const STRICT = {
    mixedToken: String.raw`\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{6,}\b`,
    number: String.raw`(?<![\d.])\d{5,}(?![\d.])`,
  };

  // Things strict mode would otherwise catch that are fine to show.
  const STRICT_ALLOW = /^(?:[a-z]{2}(?:-gov|-iso[a-z]?)?-[a-z]+-\d+[a-z]?|[a-z]{2}-[a-z]+-\d+-[a-z]+-\d+[a-z]?|ipv[46]|http\d|utf-?\d+|base64|sha\d+|md5|x86_64|arm64|python\d[\w.]*|nodejs\d+[\w.]*|java\d+|dotnet\d+|ruby\d[\w.]*|v\d+|h\d)$/i;

  const cache = new Map();

  function regexFor(strict) {
    const key = strict ? 'strict' : 'standard';
    if (!cache.has(key)) {
      const sources = Object.values(STANDARD);
      if (strict) sources.push(...Object.values(STRICT));
      cache.set(key, new RegExp(sources.map((s) => '(?:' + s + ')').join('|'), 'g'));
    }
    return cache.get(key);
  }

  function isAllowed(value, strict) {
    if (!strict) return false;
    // Only strict-only matches can be allowed, so check whether a standard pattern also hits.
    const standard = regexFor(false);
    standard.lastIndex = 0;
    const m = standard.exec(value);
    if (m && m[0] === value) return false;
    return STRICT_ALLOW.test(value);
  }

  // Returns [{start, end}] for every sensitive value in text.
  function findMatches(text, strict) {
    const out = [];
    if (!text || text.length < 5) return out;
    const re = regexFor(strict);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (!isAllowed(m[0], strict)) out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function hasMatch(text, strict) {
    return findMatches(text, strict).length > 0;
  }

  // Replaces sensitive values with dots, used for tab titles.
  function mask(text, strict) {
    const matches = findMatches(text, strict);
    if (!matches.length) return text;
    let result = '';
    let last = 0;
    for (const { start, end } of matches) {
      result += text.slice(last, start) + '••••';
      last = end;
    }
    return result + text.slice(last);
  }

  const api = { findMatches, hasMatch, mask, STANDARD, STRICT };
  root.AWSCloakPatterns = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
