// Run with: node tests/patterns.test.js
const assert = require('assert');
const P = require('../src/patterns.js');

const shouldBlur = [
  '123456789012',
  '1234-5678-9012',
  'arn:aws:iam::123456789012:role/WorkshopRole',
  'arn:aws:lambda:us-east-1:123456789012:function:my-func',
  'arn:aws:s3:::my-bucket',
  'i-0abc123def4567890',
  'vol-0123456789abcdef0',
  'sg-0a1b2c3d',
  'subnet-0bb1c79de3EXAMPLE'.toLowerCase().replace('example', '12345'),
  'tgw-attach-0123456789abcdef0',
  'ssoins-72233c0123456789',
  'd-9067123456',
  'ami-0abcdef1234567890',
  'AKIAIOSFODNN7EXAMPLE',
  'ASIAY34FZKBOKMUTVV7A',
  'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  '10.0.1.25',
  '172.31.0.0/16',
  '2600:1f18:abcd:1200::/56',
  'https://d-9067123456.awsapps.com/start',
  'd-9067123456.awsapps.com',
  'abcdef1234.execute-api.us-east-1.amazonaws.com',
  'd111111abcdef8.cloudfront.net',
  'E2QWRUHAPOMQZL',
  'Z0123456789ABCDEFGHIJ',
  'a1b2c3d4e5',
  'nathan@example.com',
  '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  'us-east-1_AbCdEf123',
  'https://my-func.lambda-url.us-east-1.on.aws/',
];

const shouldShow = [
  'Lambda',
  'Create function',
  'us-east-1',
  'US East (N. Virginia)',
  't3.micro',
  'python3.12',
  'nodejs20.x',
  '2024-11-06',
  'Running',
  '128 MB',
  'Last modified 3 minutes ago',
  'arm64',
  'Version 1.2',
  'my-workshop-bucket',
];

let failed = 0;
for (const s of shouldBlur) {
  const m = P.findMatches(s, false);
  const covered = m.some((r) => r.start === 0 && r.end === s.length);
  if (!covered) { failed++; console.log('NOT BLURRED (expected blur):', s, JSON.stringify(m)); }
}
for (const s of shouldShow) {
  if (P.hasMatch(s, false)) { failed++; console.log('BLURRED (expected visible):', s, JSON.stringify(P.findMatches(s, false))); }
}
// Strict mode catches mixed tokens but keeps regions visible.
assert.ok(P.hasMatch('build42', true), 'strict should catch mixed tokens');
assert.ok(!P.hasMatch('us-east-1', true), 'strict should keep regions visible');
assert.ok(!P.hasMatch('build42', false), 'standard should not catch build42abc');
// Masking for tab titles.
assert.strictEqual(P.mask('i-0abc123def4567890 | EC2 | us-east-1', false), '•••• | EC2 | us-east-1');
// Inside a sentence.
const sentence = 'Role arn:aws:iam::123456789012:role/Admin was assumed from 10.0.0.1 today';
assert.strictEqual(P.findMatches(sentence, false).length, 2);

if (failed) { console.log(failed + ' pattern checks failed'); process.exit(1); }
console.log('All pattern checks passed (' + (shouldBlur.length + shouldShow.length) + ' cases plus asserts)');
