---
title: How to Sign Commits with GPG
date: 2023-09-01
link:
  - label: Guide Repository
    url: https://github.com/username/gpg-guide
image: /images/blogs/gpg-guide.png
description: A step-by-step guide to setting up GPG keys and signing Git commits, plus what the verified badge does and does not prove.
skills:
  - Git
  - Security
  - Cryptography
---

Signing commits lets other people verify that a commit came from the key you control. It does
not prove you wrote the code, and it does not stop anyone from putting your name in the author
field. It proves one narrow thing well, which is worth understanding before you start.

## Generating a key

Use a modern algorithm and set an expiry. An expiring key that you renew is much safer than an
eternal key you will never get around to revoking.

```bash
gpg --full-generate-key --expert
# choose: (9) ECC and ECC, then (1) Curve 25519, then 2y

gpg --list-secret-keys --keyid-format=long
# sec   ed25519/3AA5C34371567BD2 2023-09-01 [SC] [expires: 2025-09-01]
```

The long id after the slash is what Git needs.

## Telling Git about it

```bash
git config --global user.signingkey 3AA5C34371567BD2
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

On macOS the agent needs a pinentry that can actually draw a window, otherwise signing hangs
with no output at all:

```bash
brew install pinentry-mac
echo "pinentry-program $(which pinentry-mac)" >> ~/.gnupg/gpg-agent.conf
gpgconf --kill gpg-agent
```

## Uploading the public half

Export the *public* key and paste it into your forge's settings. If you ever paste the output
of `--export-secret-keys`, rotate everything immediately.

```bash
gpg --armor --export 3AA5C34371567BD2 | pbcopy
```

## What the badge means

| Badge | What it actually tells you |
|---|---|
| Verified | The signature matches a key the forge has on file for that account |
| Partially verified | Signed, but the committer email is not on the account |
| Unverified | Signed with a key the forge does not know |
| No badge | Not signed at all |

> "Verified" is a statement about a key, not about a person. It says the holder of that private
> key made this commit. Whether that holder is who you think it is depends entirely on how the
> key reached the account in the first place.

Two things follow from that:

1. A compromised laptop produces perfectly verified commits.
2. Signing is most valuable on tags and releases, where a single artefact is the thing everyone
   downstream trusts.

## Troubleshooting

- `gpg failed to sign the data` almost always means the agent could not prompt you. Run
  `echo test | gpg --clearsign` on its own to see the real error.
- If you use a different key per machine, add all of them to the account rather than copying a
  private key around.
- `$GPG_TTY` needs to be set in your shell profile for terminal pinentry:
  `export GPG_TTY=$(tty)`.
