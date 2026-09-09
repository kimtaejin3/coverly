import json

from coverly_worker.cli import main


def test_generate_cli_runs_with_fake_components(tone_wav, tmp_path, capsys):
    song = tone_wav("song.wav", seconds=3.0)
    out = tmp_path / "cover.mp3"
    metrics_json = tmp_path / "metrics.json"
    code = main(["--input", str(song), "--voice", "unused", "--start", "1", "--duration", "1",
                 "--output", str(out), "--separator", "copy", "--provider", "passthrough",
                 "--device", "cpu", "--metrics-json", str(metrics_json)])
    assert code == 0
    assert out.exists()
    printed = capsys.readouterr().out
    assert "Generation completed" in printed and "Total:" in printed
    data = json.loads(metrics_json.read_text())
    assert data["provider"] == "passthrough" and data["device"] == "cpu"
    assert abs(data["audio_duration_seconds"] - 1.0) < 0.05


def test_generate_cli_duration_zero_means_full_song(tone_wav, tmp_path):
    from coverly_worker.audio import probe_duration
    song = tone_wav("song.wav", seconds=2.0)
    out = tmp_path / "full.mp3"
    code = main(["--input", str(song), "--voice", "x", "--start", "0", "--duration", "0",
                 "--output", str(out), "--separator", "copy", "--provider", "passthrough", "--device", "cpu"])
    assert code == 0
    assert probe_duration(out) > 1.8


def test_generate_cli_reports_missing_input(tmp_path, capsys):
    code = main(["--input", str(tmp_path / "missing.mp3"), "--voice", "x", "--output", str(tmp_path / "o.mp3"),
                 "--separator", "copy", "--provider", "passthrough", "--device", "cpu"])
    assert code == 1
    assert "missing.mp3" in capsys.readouterr().err
