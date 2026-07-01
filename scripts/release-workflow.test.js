import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const RELEASE_WORKFLOW_PATH = path.join(PROJECT_ROOT, '.github/workflows/release.yml');

function readReleaseWorkflow() {
  return fs.readFileSync(RELEASE_WORKFLOW_PATH, 'utf-8');
}

function workflowJob(workflow, jobName) {
  const lines = workflow.split('\n');
  const startIndex = lines.findIndex((line) => line === `  ${jobName}:`);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const nextJobIndex = lines.findIndex(
    (line, index) => index > startIndex && /^ {2}[a-zA-Z0-9_-]+:$/.test(line)
  );
  const endIndex = nextJobIndex === -1 ? lines.length : nextJobIndex;
  return lines.slice(startIndex, endIndex).join('\n');
}

describe('release workflow publish-once contract', () => {
  it('preserves main and v-tag release triggers', () => {
    const workflow = readReleaseWorkflow();

    expect(workflow).toContain('tags:\n      - "v*"');
    expect(workflow).toContain('branches:\n      - main');
  });

  it('has exactly one tag-owning prepare job and no tag creation in platform jobs', () => {
    const workflow = readReleaseWorkflow();
    const prepareJob = workflowJob(workflow, 'prepare-release');
    const buildMacJob = workflowJob(workflow, 'build-mac');
    const buildWindowsJob = workflowJob(workflow, 'build-windows');

    expect(workflow.match(/git push origin/g) ?? []).toHaveLength(1);
    expect(prepareJob).toContain('git push origin "$VERSION"');
    expect(prepareJob).toContain('tag_name');
    expect(prepareJob).toContain('should_release');
    expect(buildMacJob).not.toMatch(/git tag|git push origin/);
    expect(buildWindowsJob).not.toMatch(/git tag|git push origin/);
  });

  it('keeps write-capable repository tokens out of build and verify jobs', () => {
    const workflow = readReleaseWorkflow();
    const prepareJob = workflowJob(workflow, 'prepare-release');
    const buildMacJob = workflowJob(workflow, 'build-mac');
    const buildWindowsJob = workflowJob(workflow, 'build-windows');
    const verifyJob = workflowJob(workflow, 'verify-release-artifacts');
    const publishJob = workflowJob(workflow, 'publish-release');

    expect(workflow).toContain(`permissions:
  contents: read`);
    expect(prepareJob).toContain(`permissions:
      contents: write`);
    expect(publishJob).toContain(`permissions:
      contents: write`);

    for (const job of [buildMacJob, buildWindowsJob, verifyJob]) {
      expect(job).toContain(`permissions:
      contents: read`);
      expect(job).toContain('persist-credentials: false');
      expect(job).not.toContain('contents: write');
    }
  });

  it('builds macOS and Windows artifacts without per-platform release publishing', () => {
    const workflow = readReleaseWorkflow();
    const buildMacJob = workflowJob(workflow, 'build-mac');
    const buildWindowsJob = workflowJob(workflow, 'build-windows');

    expect(buildMacJob).toContain('runs-on: macos-latest');
    expect(buildMacJob).toContain('bun-version: "1.3.14"');
    expect(buildMacJob).toContain("node-version: '24.16.0'");
    expect(buildMacJob).toContain('bun run package:mac:release');
    expect(buildMacJob).not.toContain('bun run package -- --publish never');
    expect(buildMacJob).toContain('actions/upload-artifact@');
    expect(buildMacJob).not.toContain('softprops/action-gh-release');

    expect(buildWindowsJob).toContain('runs-on: ${{ matrix.runner }}');
    expect(buildWindowsJob).toContain(`matrix:
        include:
          - arch: x64
            runner: windows-latest
            processor_architecture: AMD64
          - arch: arm64
            runner: windows-11-arm
            processor_architecture: ARM64`);
    expect(buildWindowsJob).not.toContain('arch: [x64, arm64]');
    expect(buildWindowsJob.match(/runner: windows-latest/g) ?? []).toHaveLength(1);
    expect(buildWindowsJob).toContain('shell: pwsh');
    expect(buildWindowsJob).toContain('$actualArchitecture = $env:PROCESSOR_ARCHITECTURE');
    expect(buildWindowsJob).toContain(
      "$expectedArchitecture = '${{ matrix.processor_architecture }}'"
    );
    expect(buildWindowsJob).toContain('if ($actualArchitecture -ne $expectedArchitecture) {');
    expect(buildWindowsJob).toContain('Write-Error "Expected Windows runner architecture');
    expect(buildWindowsJob).toContain('bun run package:win:${{ matrix.arch }}');
    expect(buildWindowsJob).toContain('WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}');
    expect(buildWindowsJob).toContain('WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}');
    expect(buildWindowsJob).not.toContain('AZURE_CLIENT_ID');
    expect(buildWindowsJob).not.toContain('CSC_LINK: ${{ secrets.CSC_LINK }}');
    expect(buildWindowsJob).not.toContain('WINDOWS_CERTIFICATE_FILE');
    expect(buildWindowsJob).toContain('- name: Verify Windows Authenticode signature');
    expect(buildWindowsJob).toContain("if: vars.WINDOWS_ALLOW_UNSIGNED_RELEASE != 'true'");
    expect(buildWindowsJob).toContain('Get-AuthenticodeSignature -FilePath $installer.FullName');
    expect(buildWindowsJob).toContain("if ($signature.Status -ne 'Valid') {");
    expect(buildWindowsJob).toContain(
      'bun scripts/verify-windows-package-artifacts.js --dist dist --manifest --require-arch ${{ matrix.arch }}'
    );
    expect(buildWindowsJob).toContain('bun run package:win:signing-policy');
    expect(buildWindowsJob.indexOf('bun run package:win:signing-policy')).toBeLessThan(
      buildWindowsJob.indexOf('bun run package:win:${{ matrix.arch }}')
    );
    const architectureProofStep = buildWindowsJob.indexOf(
      '- name: Verify Windows runner architecture'
    );
    expect(architectureProofStep).toBeGreaterThanOrEqual(0);
    expect(architectureProofStep).toBeLessThan(
      buildWindowsJob.indexOf('bun run package:win:${{ matrix.arch }}')
    );
    const signatureProofStep = buildWindowsJob.indexOf(
      '- name: Verify Windows Authenticode signature'
    );
    expect(signatureProofStep).toBeGreaterThan(
      buildWindowsJob.indexOf('bun run package:win:${{ matrix.arch }}')
    );
    expect(signatureProofStep).toBeLessThan(
      buildWindowsJob.indexOf('bun scripts/verify-windows-package-artifacts.js')
    );
    expect(buildWindowsJob).toContain('actions/upload-artifact@');
    expect(buildWindowsJob).not.toContain('softprops/action-gh-release');
    expect(buildWindowsJob).not.toMatch(/\b(amd64|ia32|universal)\b/);
  });

  it('verifies aggregated artifacts before the single publish job uploads release assets', () => {
    const workflow = readReleaseWorkflow();
    const verifyJob = workflowJob(workflow, 'verify-release-artifacts');
    const publishJob = workflowJob(workflow, 'publish-release');

    expect(verifyJob).toContain('needs: [prepare-release, build-mac, build-windows]');
    expect(verifyJob).toContain(
      'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0'
    );
    expect(verifyJob).toContain('merge-multiple: true');
    expect(verifyJob).toContain('bun scripts/verify-release-artifacts.js');
    expect(verifyJob).toContain('bun run package:win:signing-policy');
    expect(verifyJob).toContain('WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}');
    expect(verifyJob).not.toContain('AZURE_CLIENT_ID');
    expect(verifyJob).not.toContain('CSC_LINK: ${{ secrets.CSC_LINK }}');
    expect(verifyJob).not.toContain('WINDOWS_CERTIFICATE_FILE');

    expect(workflow.match(/softprops\/action-gh-release@/g) ?? []).toHaveLength(1);
    expect(publishJob).toContain('needs: [prepare-release, verify-release-artifacts]');
    expect(publishJob).toContain(
      'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0'
    );
    expect(publishJob).toContain('tag_name: ${{ needs.prepare-release.outputs.tag_name }}');
    expect(publishJob).toContain('make_latest: true');
    expect(publishJob).toContain('verified-release-assets/*');
  });
});
