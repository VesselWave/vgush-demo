# Design

## Direction

A restrained technical gallery modeled on Vercel's public site. The page uses its visual restraint to give the shader canvases more weight.

## Color

Near-black is the permanent page surface. Off-white is the primary text and control fill. Dark gray rules divide the exhibit. Color belongs inside the WebGPU canvases, not the surrounding interface.

## Typography

Geist is the interface and display family. Headlines use tight tracking and large, plain forms. Descriptions stay compact and neutral.

## Structure

A 64px navigation bar sits above a centered opening statement. The gallery uses two columns on desktop. Two demos span both columns to break the rhythm, and the second uses an asymmetric canvas and copy split. Mobile stacks every demo. Hairline rules connect sections without wrapping each item in a card.

## Components

Buttons are compact rectangles with an 8px radius. Primary actions invert to black. The logo uses a solid CSS triangle. Demo labels pair a tabular index with a plain title, short description, and implementation note.

## Motion

Each canvas owns its animation. The rest of the page stays still. Users can dim all shaders, and the page renders only one frame when the operating system requests reduced motion.

## Accessibility

Keyboard focus uses a blue 2px outline. Text selection inverts to black. Unsupported WebGPU states replace the canvas with a direct error message.
