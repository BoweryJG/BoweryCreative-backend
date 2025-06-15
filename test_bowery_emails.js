import { sendEmail } from './src/services/emailService.js';
import { boweryEmails } from './src/services/boweryEmails.js';

async function testBoweryEmails() {
  console.log('🚀 Testing Bowery Creative Email System\n');

  try {
    // Test 1: Send as CEO
    console.log('1️⃣ Sending as CEO...');
    const ceoResult = await sendEmail({
      from: boweryEmails.getFromAddress('jgolden'),
      to: 'jgolden@bowerycreativeagency.com',
      subject: 'Test: CEO Email from Bowery Creative',
      html: `
        <h2>CEO Communication Test</h2>
        <p>This email is sent from the Bowery Creative email system.</p>
        <p>Testing multi-account rotation and professional aliases.</p>
        ${boweryEmails.getSignature('jgolden')}
      `
    });
    console.log('✅ CEO email sent!', ceoResult);

    // Test 2: Send as Creative Director
    console.log('\n2️⃣ Sending as Creative Director...');
    const creativeResult = await sendEmail({
      from: boweryEmails.getFromAddress('emily'),
      to: 'jgolden@bowerycreativeagency.com',
      subject: 'Test: Creative Brief Ready',
      html: `
        <h2>Creative Brief Test</h2>
        <p>Hi! This is Emily from the Creative team.</p>
        <p>Your creative brief is ready for review.</p>
        ${boweryEmails.getSignature('emily')}
      `
    });
    console.log('✅ Creative Director email sent!', creativeResult);

    // Test 3: Send as Hello
    console.log('\n3️⃣ Sending as Hello...');
    const helloResult = await sendEmail({
      from: boweryEmails.getFromAddress('hello'),
      to: 'jgolden@bowerycreativeagency.com',
      subject: 'Test: Welcome to Bowery Creative',
      html: `
        <h2>Welcome to Bowery Creative</h2>
        <p>Thank you for your interest in our creative services!</p>
        <p>We specialize in:</p>
        <ul>
          <li>Brand Design & Strategy</li>
          <li>Web Development</li>
          <li>Digital Marketing</li>
          <li>Creative Campaigns</li>
        </ul>
        ${boweryEmails.getSignature('hello')}
      `
    });
    console.log('✅ Hello email sent!', helloResult);

    // Show all available aliases
    console.log('\n📧 All Available Bowery Creative Email Aliases:');
    console.log('================================================');
    Object.entries(boweryEmails.addresses).forEach(([key, addr]) => {
      console.log(`${key.padEnd(15)} → ${addr.email.padEnd(40)} (${addr.name})`);
    });

    console.log('\n✨ All tests complete! Check your inbox.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run tests
testBoweryEmails();