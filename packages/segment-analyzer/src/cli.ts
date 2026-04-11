#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseTsPackets, getTsSummary } from './ts-parser';
import { findPat } from './pat-parser';
import { findPmt } from './pmt-parser';
import { findPesHeaders } from './pes-parser';

const program = new Command();

program.name('segment-analyzer').description('MPEG-TS segment analyzer for Twitch HLS research').version('0.1.0');

program
  .command('analyze')
  .description('Analyze a .ts segment file')
  .argument('<file>', 'Path to .ts file')
  .option('-v, --verbose', 'Show detailed packet info')
  .action((file: string, opts: { verbose?: boolean }) => {
    const data = readFile(file);
    const packets = parseTsPackets(data);
    const summary = getTsSummary(packets);

    console.log(`\n=== MPEG-TS Segment Analysis ===`);
    console.log(`File: ${path.resolve(file)}`);
    console.log(`Size: ${data.length} bytes`);
    console.log(`Packets: ${summary.totalPackets}`);
    console.log(`Discontinuities: ${summary.discontinuities}`);

    // PAT
    const pat = findPat(packets);
    if (pat) {
      console.log(`\n--- PAT (Program Association Table) ---`);
      console.log(`Transport Stream ID: ${pat.transportStreamId}`);
      console.log(`Version: ${pat.version}`);
      for (const prog of pat.programs) {
        console.log(`  Program ${prog.programNumber} -> PMT PID ${prog.pmtPid} (0x${prog.pmtPid.toString(16)})`);
      }

      // PMT for each program
      for (const prog of pat.programs) {
        if (prog.programNumber === 0) continue; // Skip NIT
        const pmt = findPmt(packets, prog.pmtPid);
        if (pmt) {
          console.log(`\n--- PMT (Program Map Table) for Program ${pmt.programNumber} ---`);
          console.log(`PCR PID: ${pmt.pcrPid} (0x${pmt.pcrPid.toString(16)})`);
          for (const stream of pmt.streams) {
            console.log(
              `  PID ${stream.elementaryPid} (0x${stream.elementaryPid.toString(16)}): ${stream.streamTypeName}`,
            );
          }

          // PES headers
          const esPids = pmt.streams.map((s) => s.elementaryPid);
          const pesHeaders = findPesHeaders(packets, esPids);

          if (pesHeaders.length > 0) {
            console.log(`\n--- PES Timestamps ---`);
            for (const pes of pesHeaders) {
              const streamInfo = pmt.streams.find((s) => s.elementaryPid === pes.pid);
              const type = streamInfo?.streamTypeName ?? 'unknown';
              let line = `  PID ${pes.pid} (${type}):`;
              if (pes.ptsSeconds != null) line += ` PTS=${pes.ptsSeconds.toFixed(6)}s`;
              if (pes.dtsSeconds != null) line += ` DTS=${pes.dtsSeconds.toFixed(6)}s`;
              console.log(line);
            }
          }
        }
      }
    }

    // PID distribution
    console.log(`\n--- PID Distribution ---`);
    const sortedPids = Object.entries(summary.pidCounts).sort((a, b) => b[1] - a[1]);
    for (const [pid, count] of sortedPids) {
      const percentage = ((count / summary.totalPackets) * 100).toFixed(1);
      const pidNum = parseInt(pid, 10);
      const label = pidNum === 0 ? 'PAT' : pidNum === 0x1fff ? 'Null' : `PID ${pidNum}`;
      console.log(`  ${label} (0x${pidNum.toString(16)}): ${count} packets (${percentage}%)`);
    }

    // PCR values
    if (summary.pcrValues.length > 0) {
      console.log(`\n--- PCR Values ---`);
      const first = summary.pcrValues[0];
      const last = summary.pcrValues[summary.pcrValues.length - 1];
      console.log(`  First: ${(first.pcr / 90000).toFixed(6)}s`);
      console.log(`  Last:  ${(last.pcr / 90000).toFixed(6)}s`);
      console.log(`  Duration: ${((last.pcr - first.pcr) / 90000).toFixed(6)}s`);
    }

    if (opts.verbose) {
      console.log(`\n--- First 20 Packets ---`);
      for (const pkt of packets.slice(0, 20)) {
        let line = `  @${pkt.offset}: PID=${pkt.pid}(0x${pkt.pid.toString(16)}) CC=${pkt.continuityCounter}`;
        if (pkt.pusi) line += ' [PUSI]';
        if (pkt.adaptationField?.discontinuity) line += ' [DISC]';
        if (pkt.adaptationField?.randomAccess) line += ' [RAI]';
        if (pkt.adaptationField?.pcr != null) line += ` PCR=${(pkt.adaptationField.pcr / 90000).toFixed(3)}s`;
        console.log(line);
      }
    }

    console.log('');
  });

program
  .command('compare')
  .description('Compare two .ts segment files')
  .argument('<file1>', 'First .ts file')
  .argument('<file2>', 'Second .ts file')
  .action((file1: string, file2: string) => {
    const data1 = readFile(file1);
    const data2 = readFile(file2);
    const packets1 = parseTsPackets(data1);
    const packets2 = parseTsPackets(data2);
    const summary1 = getTsSummary(packets1);
    const summary2 = getTsSummary(packets2);

    console.log(`\n=== Segment Comparison ===`);
    console.log(`File 1: ${path.basename(file1)} (${data1.length} bytes, ${summary1.totalPackets} packets)`);
    console.log(`File 2: ${path.basename(file2)} (${data2.length} bytes, ${summary2.totalPackets} packets)`);

    // Compare PIDs
    const allPids = new Set([...Object.keys(summary1.pidCounts), ...Object.keys(summary2.pidCounts)]);

    console.log(`\n--- PID Comparison ---`);
    console.log(`${'PID'.padEnd(12)} ${'File 1'.padEnd(10)} ${'File 2'.padEnd(10)} Diff`);
    for (const pid of [...allPids].sort((a, b) => parseInt(a) - parseInt(b))) {
      const c1 = summary1.pidCounts[parseInt(pid)] ?? 0;
      const c2 = summary2.pidCounts[parseInt(pid)] ?? 0;
      const diff = c2 - c1;
      const diffStr = diff > 0 ? `+${diff}` : diff.toString();
      console.log(
        `  0x${parseInt(pid).toString(16).padEnd(8)} ${c1.toString().padEnd(10)} ${c2.toString().padEnd(10)} ${diffStr}`,
      );
    }

    // Compare timestamps
    const pes1 = findPesHeaders(packets1);
    const pes2 = findPesHeaders(packets2);

    if (pes1.length > 0 && pes2.length > 0) {
      const firstPts1 = pes1.find((p) => p.ptsSeconds != null)?.ptsSeconds;
      const firstPts2 = pes2.find((p) => p.ptsSeconds != null)?.ptsSeconds;

      if (firstPts1 != null && firstPts2 != null) {
        console.log(`\n--- Timestamp Comparison ---`);
        console.log(`  File 1 first PTS: ${firstPts1.toFixed(6)}s`);
        console.log(`  File 2 first PTS: ${firstPts2.toFixed(6)}s`);
        console.log(`  PTS difference:   ${(firstPts2 - firstPts1).toFixed(6)}s`);
      }
    }

    console.log('');
  });

program
  .command('timeline')
  .description('Show PTS timeline for a .ts segment')
  .argument('<file>', 'Path to .ts file')
  .action((file: string) => {
    const data = readFile(file);
    const packets = parseTsPackets(data);
    const pat = findPat(packets);

    let esPids: number[] | undefined;
    if (pat) {
      for (const prog of pat.programs) {
        if (prog.programNumber === 0) continue;
        const pmt = findPmt(packets, prog.pmtPid);
        if (pmt) {
          esPids = pmt.streams.map((s) => s.elementaryPid);
          break;
        }
      }
    }

    const pesHeaders = findPesHeaders(packets, esPids);

    if (pesHeaders.length === 0) {
      console.log('No PES headers with timestamps found.');
      return;
    }

    console.log(`\n=== PTS Timeline ===`);
    console.log(`File: ${path.resolve(file)}`);
    console.log(
      `${'#'.padEnd(6)} ${'PID'.padEnd(10)} ${'Type'.padEnd(8)} ${'PTS (s)'.padEnd(16)} ${'DTS (s)'.padEnd(16)} PTS-DTS`,
    );

    let prevPts: number | undefined;

    for (let i = 0; i < pesHeaders.length; i++) {
      const h = pesHeaders[i];
      const pts = h.ptsSeconds?.toFixed(6) ?? '-';
      const dts = h.dtsSeconds?.toFixed(6) ?? '-';
      const ptsDtsDiff =
        h.ptsSeconds != null && h.dtsSeconds != null ? `${(h.ptsSeconds - h.dtsSeconds).toFixed(6)}s` : '-';

      let delta = '';
      if (h.ptsSeconds != null && prevPts != null) {
        delta = ` (delta=${(h.ptsSeconds - prevPts).toFixed(6)}s)`;
      }
      if (h.ptsSeconds != null) prevPts = h.ptsSeconds;

      const streamType = h.streamId >= 0xe0 ? 'Video' : h.streamId >= 0xc0 ? 'Audio' : 'Other';

      console.log(
        `  ${i.toString().padEnd(6)}` +
          `0x${h.pid.toString(16).padEnd(8)}` +
          `${streamType.padEnd(8)}` +
          `${pts.padEnd(16)}` +
          `${dts.padEnd(16)}` +
          `${ptsDtsDiff}${delta}`,
      );
    }

    console.log('');
  });

function readFile(filePath: string): Buffer {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved);
}

program.parse();
