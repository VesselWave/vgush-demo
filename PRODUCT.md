# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, and Vite. Package management uses Bun.

## Users

Developers exploring what compact WebGPU demos can do in the browser.

## Product purpose

A focused gallery of nine WebGPU experiments, including three raymarched 3D scenes and a drawable light field. Each demo runs on the page and links its visual result to a short explanation of the GPU technique.

## Positioning

The page is a small, runnable exhibit rather than a complete catalog or documentation mirror.

## Capabilities and constraints

- The gallery's examples must use WebGPU directly.
- The Radiance Cascades study adapts the interaction and rendering approach from the vgpu example at https://vgpu.sh/examples/radiance-cascades.
- The page must handle browsers without WebGPU.
- No claims that the demos use the vgpu library.
- No development server or production build is run unless requested.

## Brand commitments

The page should use Vercel.com's restrained black-and-white design language.

## Evidence on hand

The vgpu documentation at https://vgpu.sh/docs establishes the subject and terminology. Eight demos on this page are original. The Radiance Cascades study is based on the published vgpu example.

## Product principles

- Show the render before explaining it.
- Keep controls immediate and sparse.
- Make unsupported-browser behavior clear.
- Prefer a small complete exhibit over a broad catalog.
