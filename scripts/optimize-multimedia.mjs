#!/usr/bin/env node

/**
 * Script to optimize multimedia assets for AutaMedica.
 * Handles video compression, metadata and preload configuration.
 * Prioritizes Astro public assets and falls back to legacy Next public assets.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🎬 Optimizing multimedia assets for AutaMedica...\n');

const PUBLIC_DIR_CANDIDATES = [
  path.join(process.cwd(), 'apps/web/public'),
  path.join(process.cwd(), 'apps/web-app/public'),
];

const PUBLIC_DIR = PUBLIC_DIR_CANDIDATES.find((dir) => fs.existsSync(dir))
  ?? PUBLIC_DIR_CANDIDATES[0];
const VIDEOS_DIR = path.join(PUBLIC_DIR, 'videos');

// Video configurations for different qualities
const VIDEO_CONFIGS = {
  mobile: {
    width: 720,
    bitrate: '1M',
    suffix: '-mobile'
  },
  tablet: {
    width: 1280,
    bitrate: '2M',
    suffix: '-tablet'
  },
  desktop: {
    width: 1920,
    bitrate: '4M',
    suffix: '-hd'
  }
};

async function analyzeVideoFiles() {
  console.log('📊 Analyzing video files...');

  try {
    const videoFiles = fs.readdirSync(VIDEOS_DIR).filter(file => file.endsWith('.mp4'));

    console.log(`Found ${videoFiles.length} video files:`);

    for (const file of videoFiles) {
      const filePath = path.join(VIDEOS_DIR, file);
      const stats = fs.statSync(filePath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`  ✅ ${file}: ${sizeInMB} MB`);

      // Check if video is already optimized
      if (file.includes('-mobile') || file.includes('-tablet') || file.includes('-hd')) {
        console.log(`     ℹ️  Already optimized (${file.includes('-mobile') ? 'mobile' : file.includes('-tablet') ? 'tablet' : 'desktop'} version)`);
      }
    }

    return videoFiles;
  } catch (error) {
    console.error('❌ Error analyzing video files:', error.message);
    return [];
  }
}

async function checkFFmpegAvailability() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('✅ FFmpeg is available for video optimization');
    return true;
  } catch {
    console.log('⚠️  FFmpeg not available - skipping video optimization');
    console.log('   Install FFmpeg with: sudo apt install ffmpeg');
    return false;
  }
}

async function optimizeVideos(videoFiles) {
  const hasFFmpeg = await checkFFmpegAvailability();

  if (!hasFFmpeg) {
    console.log('📝 Video optimization requires FFmpeg installation');
    return;
  }

  console.log('\n🎥 Optimizing videos for different devices...');

  for (const file of videoFiles) {
    // Skip already optimized files
    if (file.includes('-mobile') || file.includes('-tablet') || file.includes('-hd')) {
      continue;
    }

    const baseName = path.basename(file, '.mp4');
    const inputPath = path.join(VIDEOS_DIR, file);

    console.log(`\n📹 Processing: ${file}`);

    for (const [device, config] of Object.entries(VIDEO_CONFIGS)) {
      const outputFile = `${baseName}${config.suffix}.mp4`;
      const outputPath = path.join(VIDEOS_DIR, outputFile);

      // Skip if optimized version already exists
      if (fs.existsSync(outputPath)) {
        console.log(`  ⏭️  ${device} version already exists`);
        continue;
      }

      try {
        console.log(`  🔄 Creating ${device} version...`);

        const ffmpegCommand = [
          'ffmpeg',
          '-i', `"${inputPath}"`,
          '-vf', `scale=${config.width}:-2`,
          '-c:v', 'libx264',
          '-b:v', config.bitrate,
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          '-y',
          `"${outputPath}"`
        ].join(' ');

        execSync(ffmpegCommand, { stdio: 'pipe' });

        const newStats = fs.statSync(outputPath);
        const newSizeInMB = (newStats.size / (1024 * 1024)).toFixed(2);

        console.log(`  ✅ ${device}: ${newSizeInMB} MB`);
      } catch (error) {
        console.error(`  ❌ Failed to optimize for ${device}:`, error.message);
      }
    }
  }
}

async function generatePreloadConfig() {
  console.log('\n📋 Generating preload configuration...');

  const videoFiles = fs.readdirSync(VIDEOS_DIR).filter(file => file.endsWith('.mp4'));

  const preloadConfig = {
    videos: {
      primary: [],
      mobile: [],
      tablet: [],
      desktop: []
    },
    generated: new Date().toISOString(),
    totalFiles: videoFiles.length
  };

  // Categorize videos by type
  for (const file of videoFiles) {
    const filePath = `/videos/${file}`;

    if (file.includes('-mobile')) {
      preloadConfig.videos.mobile.push(filePath);
    } else if (file.includes('-tablet')) {
      preloadConfig.videos.tablet.push(filePath);
    } else if (file.includes('-hd')) {
      preloadConfig.videos.desktop.push(filePath);
    } else {
      preloadConfig.videos.primary.push(filePath);
    }
  }

  // Write config file
  const configPath = path.join(VIDEOS_DIR, 'preload-config.json');
  fs.writeFileSync(configPath, JSON.stringify(preloadConfig, null, 2));

  console.log(`✅ Preload config generated: ${configPath}`);
  console.log(`   Primary videos: ${preloadConfig.videos.primary.length}`);
  console.log(`   Mobile versions: ${preloadConfig.videos.mobile.length}`);
  console.log(`   Tablet versions: ${preloadConfig.videos.tablet.length}`);
  console.log(`   Desktop versions: ${preloadConfig.videos.desktop.length}`);

  return preloadConfig;
}

async function generateVideoMetadata() {
  console.log('\n📝 Generating video metadata...');

  const videoFiles = fs.readdirSync(VIDEOS_DIR).filter(file => file.endsWith('.mp4'));
  const metadata = {
    videos: {},
    totalSize: 0,
    generated: new Date().toISOString()
  };

  for (const file of videoFiles) {
    const filePath = path.join(VIDEOS_DIR, file);
    const stats = fs.statSync(filePath);
    const sizeInBytes = stats.size;
    const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

    metadata.videos[file] = {
      size: sizeInBytes,
      sizeMB: parseFloat(sizeInMB),
      lastModified: stats.mtime.toISOString(),
      publicPath: `/videos/${file}`
    };

    metadata.totalSize += sizeInBytes;
  }

  metadata.totalSizeMB = (metadata.totalSize / (1024 * 1024)).toFixed(2);

  // Write metadata file
  const metadataPath = path.join(VIDEOS_DIR, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  console.log(`✅ Video metadata generated: ${metadataPath}`);
  console.log(`   Total videos: ${Object.keys(metadata.videos).length}`);
  console.log(`   Total size: ${metadata.totalSizeMB} MB`);

  return metadata;
}

async function validateVideoFormats() {
  console.log('\n🔍 Validating video formats...');

  const videoFiles = fs.readdirSync(VIDEOS_DIR).filter(file => file.endsWith('.mp4'));
  const issues = [];

  for (const file of videoFiles) {
    const filePath = path.join(VIDEOS_DIR, file);
    const stats = fs.statSync(filePath);
    const sizeInMB = stats.size / (1024 * 1024);

    // Check file size
    if (sizeInMB > 10) {
      issues.push(`${file}: Large file size (${sizeInMB.toFixed(2)} MB) - consider compression`);
    }

    // Check naming convention
    if (!file.match(/^[a-z0-9\-]+\.(mp4)$/)) {
      issues.push(`${file}: Non-standard naming convention`);
    }
  }

  if (issues.length > 0) {
    console.log('⚠️  Issues found:');
    issues.forEach(issue => console.log(`   • ${issue}`));
  } else {
    console.log('✅ All video formats are valid');
  }

  return issues;
}

async function generateOptimizationReport(videoFiles, metadata, issues) {
  console.log('\n📊 Optimization Summary:');
  console.log(`   Videos processed: ${videoFiles.length}`);
  console.log(`   Total size: ${metadata.totalSizeMB} MB`);
  console.log(`   Issues found: ${issues.length}`);

  if (videoFiles.length > 0) {
    console.log('\n🎯 Recommendations:');
    console.log('   ✅ Use responsive video loading based on device');
    console.log('   ✅ Implement lazy loading for non-critical videos');
    console.log('   ✅ Add video preload hints for hero videos');
    console.log('   ✅ Consider WebM format for better compression');

    console.log('\n💡 Astro/Frontend Implementation:');
    console.log('   • Add preload links in layout for critical videos');
    console.log('   • Use islands only where interaction is required');
    console.log('   • Implement intersection observer for lazy loading');
  }

  console.log('\n🚀 Multimedia optimization completed!');
}

// Main execution
async function main() {
  try {
    console.log(`📂 Using public directory: ${PUBLIC_DIR}`);

    // Create directories if they don't exist
    if (!fs.existsSync(VIDEOS_DIR)) {
      fs.mkdirSync(VIDEOS_DIR, { recursive: true });
      console.log('📁 Created videos directory');
    }

    // Analyze current video files
    const videoFiles = await analyzeVideoFiles();

    if (videoFiles.length === 0) {
      console.log('📭 No video files found to optimize');
      return;
    }

    // Optimize videos for different devices
    await optimizeVideos(videoFiles);

    // Generate configuration files
    await generatePreloadConfig();
    const metadata = await generateVideoMetadata();

    // Validate formats
    const issues = await validateVideoFormats();

    // Generate final report
    await generateOptimizationReport(videoFiles, metadata, issues);

  } catch (error) {
    console.error('\n❌ Multimedia optimization failed:', error.message);
    process.exit(1);
  }
}

main();
