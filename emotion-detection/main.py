"""Run emotion and state analysis on a video file or webcam.

    python main.py --video path/to/video.mp4 [--show]
    python main.py --webcam
    python main.py --webcam --backend openvino      # after: python deploy/export.py
"""

import os
import sys
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from video_processor import VideoProcessor


def parse_args():
    parser = argparse.ArgumentParser(description="Video Emotion & State Analysis")
    parser.add_argument('--video', type=str, default=None,
                        help='Path to input video file')
    parser.add_argument('--webcam', action='store_true',
                        help='Use webcam instead of a video file')
    parser.add_argument('--show', action='store_true',
                        help='Show video in a window while processing')
    parser.add_argument('--model', type=str,
                        default=os.path.join('models', 'emotion_cnn.keras'),
                        help='Path to trained model (.keras)')
    parser.add_argument('--backend', choices=['keras', 'pytorch', 'onnx', 'openvino'], default='keras',
                        help='Inference runtime (run deploy/export.py first for the others)')
    parser.add_argument('--precision', choices=['fp32', 'fp16', 'bf16', 'int8'], default='fp32',
                        help='OpenVINO precision')
    parser.add_argument('--output-dir', type=str, default='output',
                        help='Directory to save output video')
    parser.add_argument('--smoothing', type=int, default=7,
                        help='Frames to average for prediction smoothing (higher=smoother)')
    return parser.parse_args()


def main():
    args = parse_args()

    if not args.video and not args.webcam:
        print("Error: must provide either --video <path> or --webcam")
        sys.exit(1)

    processor = VideoProcessor(
        model_path=args.model,
        output_dir=args.output_dir,
        smoothing_window=args.smoothing,
        backend=args.backend,
        precision=args.precision,
    )

    if args.webcam:
        processor.process_webcam()
    else:
        out_path = processor.process_video(args.video, show_live=args.show)
        print(f"\nDone! Annotated video: {out_path}")


if __name__ == '__main__':
    main()
