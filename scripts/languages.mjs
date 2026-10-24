// Node.js 18+; no npm packages required. Keep LANGUAGE_STATS_TOKEN in an Actions Secret.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://api.github.com';
// GitHub Linguist language colors, retrieved 2026-10-21.
// Source: https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml
// Keep colors tied to language names, independently of their share or ranking.
const LANGUAGE_COLORS = new Map(Object.entries({
  "1C Enterprise": "#814CCC",
  "2-Dimensional Array": "#38761D",
  "4D": "#004289",
  "ABAP": "#E8274B",
  "ABAP CDS": "#555E25",
  "AGS Script": "#B9D9FF",
  "AIDL": "#34EB6B",
  "AL": "#3AA2B5",
  "ALGOL": "#D1E0DB",
  "AMPL": "#E6EFBB",
  "ANTLR": "#9DC3FF",
  "API Blueprint": "#2ACCA8",
  "APL": "#5A8164",
  "ASP.NET": "#9400FF",
  "ATS": "#1AC620",
  "ActionScript": "#882B0F",
  "Ada": "#02F88C",
  "Adblock Filter List": "#800000",
  "Adobe Font Metrics": "#FA0F00",
  "Agda": "#315665",
  "Aiken": "#640FF8",
  "Aleo": "#154BF9",
  "Alloy": "#64C800",
  "Alpine Abuild": "#0D597F",
  "Altium Designer": "#A89663",
  "AngelScript": "#C7D7DC",
  "Answer Set Programming": "#A9CC29",
  "Ant Build System": "#A9157E",
  "Antlers": "#FF269E",
  "ApacheConf": "#D12127",
  "Apex": "#1797C0",
  "Apollo Guidance Computer": "#0B3D91",
  "AppleScript": "#101F1F",
  "Arc": "#AA2AFE",
  "ArkTS": "#0080FF",
  "AsciiDoc": "#73A0C5",
  "AspectJ": "#A957B0",
  "Assembly": "#6E4C13",
  "Astro": "#FF5A03",
  "Asymptote": "#FF0000",
  "Augeas": "#9CC134",
  "AutoHotkey": "#6594B9",
  "AutoIt": "#1C3552",
  "Avro IDL": "#0040FF",
  "Awk": "#C30E9B",
  "B": "#DA7666",
  "B (Formal Method)": "#8AA8C5",
  "B4X": "#00E4FF",
  "BAML": "#A855F7",
  "BASIC": "#FF0000",
  "BBCode": "#CAFF42",
  "BIRD2": "#B6D7E4",
  "BQN": "#2B7067",
  "Ballerina": "#FF5000",
  "Batchfile": "#C1F12E",
  "Beef": "#A52F4E",
  "Berry": "#15A13C",
  "BibTeX": "#778899",
  "Bicep": "#519ABA",
  "Bikeshed": "#5562AC",
  "Bison": "#6A463F",
  "BitBake": "#00BCE4",
  "Blade": "#F7523F",
  "BlitzBasic": "#00FFAE",
  "BlitzMax": "#CD6400",
  "Blueprint": "#3584E4",
  "Bluespec": "#12223C",
  "Bluespec BH": "#12223C",
  "Boo": "#D4BEC1",
  "Boogie": "#C80FA0",
  "Brainfuck": "#2F2530",
  "BrighterScript": "#66AABB",
  "Brightscript": "#662D91",
  "Browserslist": "#FFD539",
  "Bru": "#F4AA41",
  "BuildStream": "#006BFF",
  "C": "#555555",
  "C#": "#7355DD",
  "C++": "#F34B7D",
  "C3": "#2563EB",
  "CAP CDS": "#0092D1",
  "CLIPS": "#00A300",
  "CMake": "#DA3434",
  "COLLADA": "#F1A42B",
  "CQL": "#006091",
  "CSON": "#244776",
  "CSS": "#663399",
  "CSV": "#237346",
  "CUE": "#5886E1",
  "CWeb": "#00007A",
  "Cabal Config": "#483465",
  "Caddyfile": "#22B638",
  "Cadence": "#00EF8B",
  "Cairo": "#FF4A48",
  "Cairo Zero": "#FF4A48",
  "CameLIGO": "#3BE133",
  "Cangjie": "#00868B",
  "Cap'n Proto": "#C42727",
  "Carbon": "#222222",
  "Ceylon": "#DFA535",
  "Chapel": "#8DC63F",
  "ChucK": "#3F8000",
  "Circom": "#707575",
  "Cirru": "#CCCCFF",
  "Clarion": "#DB901E",
  "Clarity": "#5546FF",
  "Classic ASP": "#6A40FD",
  "Clean": "#3F85AF",
  "Click": "#E4E6F3",
  "Clojure": "#DB5855",
  "Closure Templates": "#0D948F",
  "Cloud Firestore Security Rules": "#FFA000",
  "Clue": "#0009B5",
  "CodeQL": "#140F46",
  "CoffeeScript": "#244776",
  "ColdFusion": "#ED2CD6",
  "ColdFusion CFC": "#ED2CD6",
  "Common Lisp": "#3FB68B",
  "Common Workflow Language": "#B5314C",
  "Component Pascal": "#B0CE4E",
  "Cooklang": "#E15A29",
  "Crystal": "#000100",
  "Csound": "#1A1A1A",
  "Csound Document": "#1A1A1A",
  "Csound Score": "#1A1A1A",
  "Cuda": "#3A4E3A",
  "Curry": "#531242",
  "Cylc": "#00B3FD",
  "Cypher": "#34C0EB",
  "Cython": "#FEDF5B",
  "D": "#BA595E",
  "D2": "#526EE8",
  "DM": "#447265",
  "Dafny": "#FFEC25",
  "Darcs Patch": "#8EFF23",
  "Dart": "#00B4AB",
  "Daslang": "#D3D3D3",
  "DataWeave": "#003A52",
  "Debian Package Control File": "#D70751",
  "DenizenScript": "#FBEE96",
  "Dhall": "#DFAFFF",
  "DirectX 3D File": "#AACE60",
  "Dockerfile": "#384D54",
  "Dogescript": "#CCA760",
  "Dotenv": "#E5D559",
  "Dune": "#89421E",
  "Dylan": "#6C616E",
  "E": "#CCCE35",
  "ECL": "#8A1267",
  "ECLiPSe": "#001D9D",
  "EJS": "#A91E50",
  "EQ": "#A78649",
  "Earthly": "#2AF0FF",
  "Easybuild": "#069406",
  "Ecere Projects": "#913960",
  "Ecmarkup": "#EB8131",
  "Edge": "#0DFFE0",
  "EdgeQL": "#31A7FF",
  "EditorConfig": "#FFF1F2",
  "Eiffel": "#4D6977",
  "Elixir": "#8847B9",
  "Elm": "#60B5CC",
  "Elvish": "#55BB55",
  "Elvish Transcript": "#55BB55",
  "Emacs Lisp": "#C065DB",
  "EmberScript": "#FFF4F3",
  "Erlang": "#B83998",
  "Euphoria": "#FF790B",
  "F#": "#B845FC",
  "F*": "#572E30",
  "FIGlet Font": "#FFDDBB",
  "FIRRTL": "#2F632F",
  "FLUX": "#88CCFF",
  "FPP": "#D37327",
  "Factor": "#636746",
  "Fancy": "#7B9DB4",
  "Fantom": "#14253C",
  "Faust": "#C37240",
  "Fennel": "#FFF3D7",
  "Filebench WML": "#F6B900",
  "FlatBuffers": "#ED284A",
  "Flix": "#D44A45",
  "Fluent": "#FFCC33",
  "Forth": "#341708",
  "Fortran": "#4D41B1",
  "Fortran Free Form": "#4D41B1",
  "FreeBASIC": "#141AC9",
  "FreeMarker": "#0050B2",
  "Frege": "#00CAFE",
  "Futhark": "#5F021F",
  "G-code": "#D08CF2",
  "GAML": "#FFC766",
  "GAMS": "#F49A22",
  "GAP": "#0000CC",
  "GCC Machine Description": "#FFCFAB",
  "GDScript": "#355570",
  "GDShader": "#478CBF",
  "GEDCOM": "#003058",
  "GLSL": "#5686A5",
  "GSC": "#FF6800",
  "Game Maker Language": "#71B417",
  "Gemfile.lock": "#701516",
  "Gemini": "#FF6900",
  "Genero 4gl": "#63408E",
  "Genero per": "#D8DF39",
  "Genie": "#FB855D",
  "Genshi": "#951531",
  "Gentoo Ebuild": "#9400FF",
  "Gentoo Eclass": "#9400FF",
  "Gerber Image": "#D20B00",
  "Gherkin": "#5B2063",
  "Git Attributes": "#F44D27",
  "Git Commit": "#F44D27",
  "Git Config": "#F44D27",
  "Git Revision List": "#F44D27",
  "Gleam": "#FFAFF3",
  "Glimmer JS": "#F5835F",
  "Glimmer TS": "#3178C6",
  "Glyph": "#C1AC7F",
  "Gno": "#226C57",
  "Gnuplot": "#F0A9F0",
  "Go": "#00ADD8",
  "Go Checksums": "#00ADD8",
  "Go Module": "#00ADD8",
  "Go Template": "#00ADD8",
  "Go Workspace": "#00ADD8",
  "Godot Resource": "#355570",
  "Golo": "#88562A",
  "Gosu": "#82937F",
  "Grace": "#615F8B",
  "Gradle": "#02303A",
  "Gradle Kotlin DSL": "#02303A",
  "Grammatical Framework": "#FF0000",
  "GraphQL": "#E10098",
  "Graphviz (DOT)": "#2596BE",
  "Groovy": "#4298B8",
  "Groovy Server Pages": "#4298B8",
  "GtkRC": "#7FE719",
  "HAProxy": "#106DA9",
  "HCL": "#844FBA",
  "HIP": "#4F3A4F",
  "HLSL": "#AACE60",
  "HOCON": "#9FF8EE",
  "HTML": "#E34C26",
  "HTML+ECR": "#2E1052",
  "HTML+EEX": "#6E4A7E",
  "HTML+ERB": "#701516",
  "HTML+PHP": "#4F5D95",
  "HTML+Razor": "#512BE4",
  "HTTP": "#005C9C",
  "HXML": "#F68712",
  "Hack": "#878787",
  "Haml": "#ECE2A9",
  "Handlebars": "#F7931E",
  "Harbour": "#0E60E3",
  "Hare": "#9D7424",
  "Haskell": "#5E5086",
  "Haxe": "#DF7900",
  "HiveQL": "#DCE200",
  "HolyC": "#FFEFAF",
  "Hosts File": "#308888",
  "Hurl": "#FF0288",
  "Hy": "#7790B2",
  "IDL": "#A3522F",
  "IGOR Pro": "#0000CC",
  "IL Assembly": "#512BD4",
  "INI": "#D1DBE0",
  "ISPC": "#2D68B1",
  "Idris": "#B30000",
  "Ignore List": "#000000",
  "ImHex Pattern Language": "#3A6BE0",
  "ImageJ Macro": "#99AAFF",
  "Imba": "#16CEC6",
  "Inno Setup": "#264B99",
  "Io": "#A9188D",
  "Ioke": "#078193",
  "Isabelle": "#FEFE00",
  "Isabelle ROOT": "#FEFE00",
  "J": "#9EEDFF",
  "JAR Manifest": "#B07219",
  "JASS": "#FF0303",
  "JCL": "#D90E09",
  "JFlex": "#DBCA00",
  "JSON": "#292929",
  "JSON with Comments": "#292929",
  "JSON5": "#267CB9",
  "JSONLD": "#0C479C",
  "JSONiq": "#40D47E",
  "Jac": "#FC792D",
  "Jai": "#AB8B4B",
  "Janet": "#0886A5",
  "Jasmin": "#D03600",
  "Java": "#B07219",
  "Java Properties": "#2A6277",
  "Java Server Pages": "#2A6277",
  "Java Template Engine": "#2A6277",
  "JavaScript": "#F1E05A",
  "JavaScript+ERB": "#F1E05A",
  "Jest Snapshot": "#15C213",
  "JetBrains MPS": "#21D789",
  "Jinja": "#A52A22",
  "Jison": "#56B3CB",
  "Jison Lex": "#56B3CB",
  "Jolie": "#843179",
  "Jsonnet": "#0064BD",
  "Julia": "#A270BA",
  "Julia REPL": "#A270BA",
  "Jupyter Notebook": "#DA5B0B",
  "Just": "#384D54",
  "KCL": "#7ABABF",
  "KDL": "#FFB3B3",
  "KFramework": "#4195C5",
  "KRL": "#28430A",
  "Kaitai Struct": "#773B37",
  "KakouneScript": "#6F8042",
  "KerboScript": "#41ADF0",
  "KiCad Layout": "#2F4AAB",
  "KiCad Legacy Layout": "#2F4AAB",
  "KiCad Schematic": "#2F4AAB",
  "KoLmafia ASH": "#B9D9B9",
  "Koka": "#215166",
  "Kotlin": "#A97BFF",
  "LFE": "#4C3023",
  "LLVM": "#185619",
  "LLVM TableGen": "#6E8B3D",
  "LOLCODE": "#CC9900",
  "LSL": "#3D9970",
  "LabVIEW": "#FEDE06",
  "Lambdapi": "#8027A3",
  "Langium": "#2C8C87",
  "Lark": "#2980B9",
  "Lasso": "#999999",
  "Latte": "#F2A542",
  "Leo": "#C4FFC2",
  "Less": "#1D365D",
  "Lex": "#DBCA00",
  "LigoLANG": "#0E74FF",
  "LilyPond": "#9CCC7C",
  "Liquid": "#67B8DE",
  "Liquidsoap": "#990066",
  "Literate Agda": "#315665",
  "Literate CoffeeScript": "#244776",
  "Literate Haskell": "#5E5086",
  "LiveCode Script": "#0C5BA5",
  "LiveScript": "#499886",
  "Lobster": "#F95428",
  "Logtalk": "#295B9A",
  "LookML": "#652B81",
  "Lua": "#000080",
  "Luau": "#00A2FF",
  "M3U": "#179C7D",
  "MATLAB": "#E16737",
  "MAXScript": "#00A6A6",
  "MDX": "#FCB32C",
  "MLIR": "#5EC8DB",
  "MQL4": "#62A8D6",
  "MQL5": "#4A76B8",
  "MTML": "#B7E1F4",
  "Macaulay2": "#D8FFFF",
  "Makefile": "#427819",
  "Mako": "#7E858D",
  "Markdown": "#083FA1",
  "Marko": "#42BFF2",
  "Mask": "#F97732",
  "Mathematical Programming System": "#0530AD",
  "Max": "#C4A79C",
  "MeTTa": "#6A5ACD",
  "Mercury": "#FF2B2B",
  "Mermaid": "#FF3670",
  "Meson": "#007800",
  "Metal": "#8F14E9",
  "MiniScript": "#4B4A56",
  "MiniYAML": "#FF1111",
  "MiniZinc": "#06A9E6",
  "Mint": "#02B046",
  "Mirah": "#C7A938",
  "Modelica": "#DE1D31",
  "Modula-2": "#10253F",
  "Modula-3": "#223388",
  "Mojo": "#FF4C1F",
  "Monkey C": "#8D6747",
  "MoonBit": "#B92381",
  "MoonScript": "#FF4585",
  "Motoko": "#FBB03B",
  "Motorola 68K Assembly": "#005DAA",
  "Move": "#4A137A",
  "Mustache": "#724B3B",
  "NCL": "#28431F",
  "NMODL": "#00356B",
  "NPM Config": "#CB3837",
  "NWScript": "#111522",
  "Nasal": "#1D2C4E",
  "Nearley": "#990000",
  "Nemerle": "#3D3C6E",
  "NetLinx": "#0AA0FF",
  "NetLinx+ERB": "#747FAA",
  "NetLogo": "#FF6375",
  "NewLisp": "#87AED7",
  "Nextflow": "#3AC486",
  "Nginx": "#009639",
  "Nickel": "#E0C3FC",
  "Nim": "#FFC200",
  "Nit": "#009917",
  "Nix": "#7E7EFF",
  "Noir": "#2F1F49",
  "Nu": "#C9DF40",
  "NumPy": "#9C8AF9",
  "Nunjucks": "#3D8137",
  "Nushell": "#4E9906",
  "OASv2-json": "#85EA2D",
  "OASv2-yaml": "#85EA2D",
  "OASv3-json": "#85EA2D",
  "OASv3-yaml": "#85EA2D",
  "OCaml": "#EF7A08",
  "OMNeT++ MSG": "#A0E0A0",
  "OMNeT++ NED": "#08607C",
  "ObjectScript": "#424893",
  "Objective-C": "#438EFF",
  "Objective-C++": "#6866FB",
  "Objective-J": "#FF0C5A",
  "Odin": "#60AFFE",
  "Omgrofl": "#CABBFF",
  "Opal": "#F7EDE0",
  "Open Policy Agent": "#7D9199",
  "OpenAPI Specification v2": "#85EA2D",
  "OpenAPI Specification v3": "#85EA2D",
  "OpenCL": "#ED2E2D",
  "OpenEdge ABL": "#5CE600",
  "OpenQASM": "#AA70FF",
  "OpenSCAD": "#E5CD45",
  "Option List": "#476732",
  "Org": "#77AA99",
  "OverPy": "#78B355",
  "OverpassQL": "#CCE2AA",
  "Oxygene": "#CDD0E3",
  "Oz": "#FAB738",
  "P4": "#7055B5",
  "PDDL": "#0D00FF",
  "PEG.js": "#234D6B",
  "PHP": "#4F5D95",
  "PLSQL": "#DAD8D8",
  "PLpgSQL": "#336790",
  "POV-Ray SDL": "#6BAC65",
  "Pact": "#F7A8B8",
  "Pan": "#CC0000",
  "Papyrus": "#6600CC",
  "Parrot": "#F3CA0A",
  "Pascal": "#E3F171",
  "Pawn": "#DBB284",
  "Pep8": "#C76F5B",
  "Perl": "#0298C3",
  "PicoLisp": "#6067AF",
  "PigLatin": "#FCD7DE",
  "Pike": "#005390",
  "Pip Requirements": "#FFD343",
  "Pkl": "#6B9543",
  "PlantUML": "#FBBD16",
  "PogoScript": "#D80074",
  "Polar": "#AE81FF",
  "Portugol": "#F8BD00",
  "PostCSS": "#DC3A0C",
  "PostScript": "#DA291C",
  "Power Query": "#D38E0D",
  "PowerBuilder": "#8F0F8D",
  "PowerShell": "#012456",
  "Praat": "#C8506D",
  "Prisma": "#0C344B",
  "Pro*C": "#BB8368",
  "Processing": "#0096D8",
  "Procfile": "#3B2F63",
  "Prolog": "#74283C",
  "Promela": "#DE0000",
  "Propeller Spin": "#7FA2A7",
  "Pug": "#A86454",
  "Puppet": "#302B6D",
  "PureBasic": "#5A6986",
  "PureScript": "#1D222D",
  "Pyret": "#EE1E10",
  "Python": "#3572A5",
  "Python console": "#3572A5",
  "Python traceback": "#3572A5",
  "Q#": "#FED659",
  "QML": "#44A51C",
  "Qt Script": "#00B841",
  "Quake": "#882233",
  "QuakeC": "#975777",
  "Quartus Simulation IP": "#58C42E",
  "QuickBASIC": "#008080",
  "Quint": "#9D6CE5",
  "R": "#198CE7",
  "RAML": "#77D9FB",
  "RAScript": "#2C97FA",
  "RBS": "#701516",
  "RDoc": "#701516",
  "REXX": "#D90E09",
  "RMarkdown": "#198CE7",
  "RON": "#A62C00",
  "ROS Interface": "#22314E",
  "RPGLE": "#2BDE21",
  "RUNOFF": "#665A4E",
  "Racket": "#3C5CAA",
  "Ragel": "#9D5200",
  "Raku": "#0000FB",
  "Rascal": "#FFFAA0",
  "ReScript": "#ED5051",
  "Reason": "#FF5847",
  "ReasonLIGO": "#FF5847",
  "Rebol": "#358A5B",
  "Record Jar": "#0673BA",
  "Red": "#F50000",
  "Redscript": "#F44336",
  "Regular Expression": "#009A00",
  "Ren'Py": "#FF7F7F",
  "Rez": "#FFDAB3",
  "Rhai": "#FBA63B",
  "Ring": "#2D54CB",
  "Riot": "#A71E49",
  "RobotFramework": "#00C0B5",
  "Roc": "#7C38F5",
  "Rocq Prover": "#D0B68C",
  "Roff": "#ECDEBE",
  "Roff Manpage": "#ECDEBE",
  "Rouge": "#CC0088",
  "RouterOS Script": "#DE3941",
  "Ruby": "#701516",
  "Rust": "#DEA584",
  "SAS": "#B34936",
  "SCSS": "#C6538C",
  "SIP": "#4E8D83",
  "SPARQL": "#0C4597",
  "SQF": "#3F3F3F",
  "SQL": "#E38C00",
  "SQLPL": "#E38C00",
  "SRecode Template": "#348A34",
  "STL": "#373B5E",
  "SVG": "#FF9900",
  "Sail": "#259DD5",
  "Salt": "#57BCAD",
  "Sass": "#A53B70",
  "Scala": "#C22D40",
  "Scaml": "#BD181A",
  "Scenic": "#FDC700",
  "Scheme": "#1E4AEC",
  "Scilab": "#CA0F21",
  "Self": "#0579AA",
  "ShaderLab": "#222C37",
  "Shell": "#89E051",
  "ShellCheck Config": "#CECFCB",
  "Shen": "#120F14",
  "Simple File Verification": "#C9BFED",
  "Singularity": "#64E6AD",
  "Slang": "#1FBEC9",
  "Slash": "#007EFF",
  "Slice": "#003FA2",
  "Slim": "#2B2B2B",
  "Slint": "#2379F4",
  "SmPL": "#C94949",
  "Smalltalk": "#596706",
  "Smarty": "#F0C040",
  "Smithy": "#C44536",
  "Snakemake": "#419179",
  "Solidity": "#AA6746",
  "SourcePawn": "#F69E1D",
  "SpiceDB Schema": "#A5318A",
  "Squirrel": "#800000",
  "Stan": "#B2011D",
  "Standard ML": "#DC566D",
  "Starlark": "#76D275",
  "Stata": "#1A5F91",
  "StringTemplate": "#3FB34F",
  "Stylus": "#FF6347",
  "SubRip Text": "#9E0101",
  "SugarSS": "#2FCC9F",
  "SuperCollider": "#46390B",
  "SurrealQL": "#FF00A0",
  "Survex data": "#FFCC99",
  "Svelte": "#FF3E00",
  "Sway": "#00F58C",
  "Sweave": "#198CE7",
  "Swift": "#F05138",
  "SystemVerilog": "#DAE1C2",
  "TI Program": "#A0AA87",
  "TL-Verilog": "#C40023",
  "TLA": "#4B0079",
  "TMDL": "#F0C913",
  "TOML": "#9C4221",
  "TSQL": "#E38C00",
  "TSV": "#237346",
  "TSX": "#3178C6",
  "TXL": "#0178B8",
  "Tact": "#48B5FF",
  "Talon": "#333333",
  "Tcl": "#E4CC98",
  "TeX": "#3D6117",
  "Teal": "#00B1BC",
  "Terra": "#00004C",
  "Terraform Template": "#7B42BB",
  "TextGrid": "#C8506D",
  "TextMate Properties": "#DF66E4",
  "Textile": "#FFE7AC",
  "Thrift": "#D12127",
  "Toit": "#C2C9FB",
  "Tolk": "#30A1F5",
  "Tor Config": "#59316B",
  "Tree-sitter Query": "#8EA64C",
  "Turing": "#CF142B",
  "Twig": "#C1D026",
  "TypeScript": "#3178C6",
  "TypeSpec": "#4A3665",
  "Typst": "#239DAD",
  "Unified Parallel C": "#4E3617",
  "Unity3D Asset": "#222C37",
  "Uno": "#9933CC",
  "UnrealScript": "#A54C4D",
  "Untyped Plutus Core": "#36ADBD",
  "UrWeb": "#CCCCEE",
  "V": "#4F87C4",
  "VBA": "#867DB1",
  "VBScript": "#15DCDC",
  "VCL": "#148AA8",
  "VHDL": "#ADB2CB",
  "Vala": "#A56DE2",
  "Valve Data Format": "#F26025",
  "Velocity Template Language": "#507CFF",
  "Vento": "#FF0080",
  "Verilog": "#B2B7F8",
  "Verse": "#518EF8",
  "Vespa Schema Definition": "#61D790",
  "Vim Help File": "#199F4B",
  "Vim Snippet": "#199F4B",
  "Vim script": "#199F4B",
  "Visual Basic .NET": "#945DB7",
  "Visual Basic 6.0": "#2C6353",
  "Volt": "#1F1F1F",
  "Vue": "#41B883",
  "Vyper": "#9F4CF2",
  "WDL": "#42F1F4",
  "WGSL": "#1A5E9A",
  "Web Ontology Language": "#5B70BD",
  "WebAssembly": "#04133B",
  "WebAssembly Interface Type": "#6250E7",
  "Whiley": "#D5C397",
  "Wikitext": "#FC5757",
  "Windows Registry Entries": "#52D5FF",
  "Witcher Script": "#FF0000",
  "Wolfram Language": "#DD1100",
  "Wollok": "#A23738",
  "World of Warcraft Addon Data": "#F7E43F",
  "Wren": "#383838",
  "X10": "#4B6BEF",
  "XC": "#99DA07",
  "XML": "#0060AC",
  "XML Property List": "#0060AC",
  "XQuery": "#5232E7",
  "XSLT": "#EB8CEB",
  "Xmake": "#22A079",
  "Xojo": "#81BD41",
  "Xonsh": "#285EEF",
  "Xtend": "#24255D",
  "YAML": "#CB171E",
  "YARA": "#220000",
  "YASnippet": "#32AB90",
  "Yacc": "#4B6C4B",
  "Yul": "#794932",
  "ZAP": "#0D665E",
  "ZIL": "#DC75E5",
  "ZenScript": "#00BCD1",
  "Zephir": "#118F9E",
  "Zig": "#EC915C",
  "Zimpl": "#D67711",
  "Zmodel": "#FF7100",
  "crontab": "#EAD7AC",
  "eC": "#913960",
  "fish": "#4AAE47",
  "hoon": "#00B171",
  "iCalendar": "#EC564C",
  "jq": "#C7254E",
  "kvlang": "#1DA6E0",
  "mIRC Script": "#3D57C3",
  "mcfunction": "#E22837",
  "mdsvex": "#5F9EA0",
  "mupad": "#244963",
  "nanorc": "#2D004D",
  "nesC": "#94B0C7",
  "ooc": "#B0B77E",
  "pkg-config": "#2B5E82",
  "q": "#0040CD",
  "reStructuredText": "#141414",
  "sed": "#64B970",
  "templ": "#66D0DD",
  "ucode": "#00B8D4",
  "vCard": "#EE2647",
  "wisp": "#7582D1",
  "xBase": "#403A40"
}));

const CARD_WIDTH = 1140;
const PADDING = 24;
const CONTENT_WIDTH = CARD_WIDTH - PADDING * 2;
const LEGEND_COLUMNS = 3;
const COLUMN_WIDTH = CONTENT_WIDTH / LEGEND_COLUMNS;
const BAR_WIDTH = CONTENT_WIDTH;

async function apiJson(path, token, fetchImpl) {
  const url = new URL(path, API);
  if (url.origin !== API) throw new Error('Refusing to send the token outside GitHub API.');
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
          'User-Agent': 'profile-languages',
        },
      });
    } catch {
      if (attempt === 2) throw new Error('Cannot reach GitHub API. Run the workflow again.');
      await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
  }
  if (!response.ok) {
    const advice = {
      401: 'LANGUAGE_STATS_TOKEN is invalid or expired. Replace the repository secret.',
      403: 'Check token access (All repositories, Metadata: Read) and GitHub API rate limits.',
      404: 'A repository is unavailable. Check token access and run the workflow again.',
    };
    // Do not print API response bodies, request URLs or private repository names.
    throw new Error(advice[response.status] ?? `GitHub API returned HTTP ${response.status}. Try again later.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('GitHub API returned invalid JSON. Run the workflow again.');
  }
}

export async function collectLanguages({ token, owner, fetchImpl = fetch }) {
  if (!token?.trim()) throw new Error('Create the LANGUAGE_STATS_TOKEN repository secret first.');
  if (!owner?.trim()) throw new Error('STATS_OWNER must contain the profile repository owner.');
  const expectedOwner = owner.trim().toLowerCase();
  const account = await apiJson('/user', token, fetchImpl);
  if (account.login?.toLowerCase() !== expectedOwner) {
    throw new Error('The token account does not match the profile owner. Create a token using the correct account.');
  }

  const repositories = new Map();
  // Read all pages; a full page is followed by another request, including an empty final page.
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      visibility: 'all', affiliation: 'owner', per_page: '100',
      sort: 'full_name', direction: 'asc', page: String(page),
    });
    const batch = await apiJson(`/user/repos?${query}`, token, fetchImpl);
    if (!Array.isArray(batch)) throw new Error('GitHub returned an unexpected repository list.');
    for (const repo of batch) {
      if (repo.owner?.login?.toLowerCase() === expectedOwner) {
        if (!Number.isSafeInteger(repo.id) || typeof repo.name !== 'string') {
          throw new Error('GitHub returned invalid repository metadata.');
        }
        // Public, private, forked and archived repositories are included intentionally.
        repositories.set(repo.id, repo);
      }
    }
    if (batch.length < 100) break;
  }
  if (repositories.size === 0) {
    throw new Error('No accessible repositories. Check Resource owner and All repositories in the token settings.');
  }

  const totals = new Map();
  for (const repo of repositories.values()) {
    const path = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/languages`;
    const languages = await apiJson(path, token, fetchImpl);
    if (!languages || Array.isArray(languages) || typeof languages !== 'object') {
      throw new Error('GitHub returned unexpected language data.');
    }
    for (const [language, bytes] of Object.entries(languages)) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('GitHub returned invalid language sizes.');
      if (bytes === 0) continue;
      const next = (totals.get(language) ?? 0) + bytes;
      if (!Number.isSafeInteger(next)) throw new Error('Language sizes exceed supported numeric precision.');
      totals.set(language, next);
    }
  }
  return totals;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

export function languageColor(language) {
  return LANGUAGE_COLORS.get(language) ?? '#EDEDED';
}

export function formatBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Code size must be a non-negative safe integer.');
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Promote values that would otherwise round to 1024.0 of the smaller unit.
  if (unit > 0 && Math.round(value * 10) >= 10240 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${bytes} B` : `${value.toFixed(1)} ${units[unit]}`;
}

function decodeXml(value) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]);
}

export function parseLanguageShares(svg) {
  const shares = new Map();
  for (const match of svg.matchAll(/<(?:rect|path)\b[^>]*class="(?:bar|donut)-segment"[^>]*>/g)) {
    const name = /\bdata-language="([^"]+)"/.exec(match[0]);
    const share = /\bdata-share="([^"]+)"/.exec(match[0]);
    if (!name || !share) return null;
    const language = decodeXml(name[1]);
    const value = Number(share[1]);
    if (!language || shares.has(language) || !Number.isFinite(value) || value <= 0 || value > 1) return null;
    shares.set(language, value);
  }
  const total = [...shares.values()].reduce((sum, value) => sum + value, 0);
  return shares.size && Math.abs(total - 1) < 1e-8 ? shares : null;
}

export function percentagePointChange(current, previous) {
  if (![current, previous].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('Language shares must be between zero and one.');
  }
  const difference = current - previous;
  const tenths = Math.round(Math.abs(difference) * 1000 + 1e-9);
  return tenths ? Math.sign(difference) * tenths / 10 : 0;
}

export async function load24HourBaseline({ now = new Date(), repository, ref = 'main', cwd = process.cwd(), fetchImpl = fetch } = {}) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tolerance = 3 * 60 * 60 * 1000;
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 });
  let records;
  try {
    records = git('log', '-80', `--before=${cutoff.toISOString()}`, '--format=%H%x09%cI%x09%an%x09%cn', '--', 'assets/languages.svg');
  } catch { return null; }
  const candidates = records.trim().split('\n').map((line) => {
    const [commit, at, author, committer] = line.split('\t');
    return { commit, at, author, committer, timestamp: Date.parse(at) };
  }).filter((record) => /^[a-f0-9]{40}$/.test(record.commit) && record.timestamp <= cutoff.getTime() &&
    record.author === 'github-actions[bot]' && record.committer === 'github-actions[bot]')
    .sort((a, b) => b.timestamp - a.timestamp);
  let baseline;
  for (const record of candidates) {
    try {
      const shares = parseLanguageShares(git('show', `${record.commit}:assets/languages.svg`));
      if (shares) { baseline = { shares, commit: record.commit, snapshotAt: record.at, observedAt: record.at, cutoffAt: cutoff.toISOString() }; break; }
    } catch { /* Try the next complete successful snapshot. */ }
  }
  if (!baseline) return null;
  if (cutoff.getTime() - Date.parse(baseline.snapshotAt) <= tolerance) return baseline;
  // Unchanged results create no Git commit. A recent successful run with the same checked-out
  // shares proves that the older snapshot was freshly observed near the 24-hour cutoff.
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) return null;
  try {
    for (let page = 1; page <= 3; page += 1) {
      const query = new URLSearchParams({ status: 'success', branch: ref, per_page: '100', page: String(page) });
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/workflows/languages.yml/runs?${query}`, {
        redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'profile-languages-history' },
      });
      if (!response.ok) return null;
      const runs = (await response.json()).workflow_runs;
      if (!Array.isArray(runs)) return null;
      const observations = runs.filter((run) => run.conclusion === 'success' && run.head_branch === ref &&
        /^[a-f0-9]{40}$/.test(run.head_sha) && Date.parse(run.updated_at) <= cutoff.getTime() &&
        cutoff.getTime() - Date.parse(run.updated_at) <= tolerance).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      for (const run of observations) {
        const checkedOut = parseLanguageShares(git('show', `${run.head_sha}:assets/languages.svg`));
        if (checkedOut?.size === baseline.shares.size && [...baseline.shares].every(([name, share]) => Math.abs((checkedOut.get(name) ?? -1) - share) < 1e-12)) {
          return { ...baseline, observedAt: run.updated_at, runId: run.id };
        }
      }
      if (runs.length < 100 || runs.some((run) => Date.parse(run.updated_at) < cutoff.getTime() - tolerance)) return null;
    }
  } catch { return null; }
  return null;
}

export function renderBarSeparators(widths, dark = false) {
  const parts = [];
  let x = PADDING;
  for (let index = 0; index < widths.length; index += 1) {
    if (index > 0 && widths[index - 1] >= 6 && widths[index] >= 6) {
      parts.push(`<path class="bar-divider" d="M${x.toFixed(6)} 52.6V62.4" stroke="${dark ? '#0d1117' : '#ffffff'}" stroke-width="1.2"/>`);
    }
    x += widths[index];
  }
  return parts.join('\n');
}

export function renderSvg(totals, dark = false, baseline = null) {
  const entries = [...totals].filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const colors = entries.map(([language]) => languageColor(language));
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Total code size exceeds supported numeric precision.');
  const rows = Math.max(1, Math.ceil(entries.length / LEGEND_COLUMNS));
  const height = 112 + rows * 34;
  const foreground = dark ? '#f0f6fc' : '#1f2328';
  const secondary = dark ? '#9198a1' : '#59636e';
  const positive = dark ? '#3fb950' : '#1a7f37';
  const negative = dark ? '#f85149' : '#cf222e';
  const provenance = baseline ? ` data-baseline-commit="${escapeXml(baseline.commit)}" data-baseline-at="${escapeXml(baseline.observedAt)}"` : '';
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${height}" viewBox="0 0 ${CARD_WIDTH} ${height}" data-total-bytes="${total}" data-comparison-hours="24"${provenance} role="img" aria-labelledby="title description">`,
    '<title id="title">All Languages · Usage · 24h changes</title>',
    '<desc id="description">Language shares and code sizes across all owned public and private repositories. Changes are percentage-point differences from the latest successful observation at or before 24 hours ago, within a three-hour tolerance. Forked and archived repositories are included.</desc>',
    '<g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Arial, sans-serif">',
    `<text x="24" y="33" fill="${foreground}" font-size="22" font-weight="600">Languages</text>`,
    `<defs><clipPath id="bar"><rect x="${PADDING}" y="52" width="${BAR_WIDTH}" height="11" rx="5.5"/></clipPath></defs>`,
    `<rect x="${PADDING}" y="52" width="${BAR_WIDTH}" height="11" rx="5.5" fill="${dark ? '#21262d' : '#eff2f5'}"/>`,
    '<g clip-path="url(#bar)">',
  ];
  let x = PADDING;
  const widths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const [language, bytes] = entries[index];
    const width = index === entries.length - 1 ? CARD_WIDTH - PADDING - x : (bytes / total) * BAR_WIDTH;
    widths.push(width);
    parts.push(`<rect class="bar-segment" data-language="${escapeXml(language)}" data-share="${(bytes / total).toPrecision(16)}" data-bytes="${bytes}" x="${x.toFixed(6)}" y="52" width="${width.toFixed(6)}" height="11" fill="${colors[index]}"/>`);
    x += width;
  }
  parts.push(renderBarSeparators(widths, dark), '</g>');
  for (let index = 0; index < entries.length; index += 1) {
    const [language, bytes] = entries[index];
    const percent = bytes / total * 100;
    const share = percent < 0.1 ? '<0.1%' : `${percent.toFixed(1)}%`;
    const codeSize = formatBytes(bytes);
    const columnX = PADDING + (index % LEGEND_COLUMNS) * COLUMN_WIDTH;
    const y = 96 + Math.floor(index / LEGEND_COLUMNS) * 34;
    const nameFit = [...language].length * 9.1 > 100 ? ' textLength="100" lengthAdjust="spacingAndGlyphs"' : '';
    const delta = baseline ? percentagePointChange(bytes / total, baseline.shares.get(language) ?? 0) : 0;
    const trendLabel = `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%`;
    const trendFit = [...trendLabel].length * 9 > 62 ? ' textLength="62" lengthAdjust="spacingAndGlyphs"' : '';
    parts.push(`<circle class="legend-dot" cx="${columnX + 6}" cy="${y - 5}" r="6" fill="${colors[index]}" stroke="${foreground}" stroke-opacity="0.35" stroke-width="0.7"/>`);
    parts.push(`<text class="legend-label" data-language="${escapeXml(language)}" data-change-pp="${delta}" x="${columnX + 22}" y="${y}" font-size="18"><tspan class="language-name" x="${columnX + 22}" fill="${foreground}" font-weight="600"${nameFit}>${escapeXml(language)}</tspan><tspan class="language-share" x="${columnX + 180}" text-anchor="end" fill="${secondary}" font-size="17">${escapeXml(share)}</tspan><tspan class="language-separator" x="${columnX + 190}" fill="${secondary}" font-size="17">·</tspan><tspan class="language-size" x="${columnX + 204}" fill="${secondary}" font-size="17">${codeSize}</tspan>${delta ? `<tspan class="language-change" x="${columnX + 298}" fill="${delta > 0 ? positive : negative}" font-size="17"${trendFit}>${trendLabel}</tspan>` : ''}</text>`);
  }
  if (!entries.length) parts.push(`<text x="24" y="96" font-size="18" fill="${secondary}">No language data in the accessible repositories.</text>`);
  parts.push(`<text x="24" y="${height - 18}" font-size="14" fill="${secondary}">All Languages · Usage · 24h changes</text>`, '</g>', '</svg>', '');
  return parts.join('\n');
}

export function updateReadmeImages(readme, version, { repository, ref = 'main' } = {}) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('STATS_REPOSITORY must contain the profile repository in owner/name format.');
  }
  if (!ref?.trim()) throw new Error('STATS_REF must contain the branch used for the language images.');
  const imageBase = `https://raw.githubusercontent.com/${repository}/${ref.split('/').map(encodeURIComponent).join('/')}/assets/`;
  let references = 0;
  const updated = readme.replace(
    /(?<![^\s"'(<])(?:(?:https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/[^\s"'()<>?#]*\/)|\.\/|\/)?assets\/(?:private-)?languages(-dark)?\.svg(?=[?\#"'()\s<>]|$)(?:\?([^"'()\s<>\#]*))?/g,
    (_, theme = '', query = '') => {
      references += 1;
      const parameters = new URLSearchParams(query.replaceAll('&amp;', '&'));
      parameters.set('v', version);
      const suffix = parameters.toString();
      // Relative GitHub /raw/ redirects drop query parameters, defeating image cache versions.
      return `${imageBase}languages${theme}.svg?${query.includes('&amp;') ? suffix.replaceAll('&', '&amp;') : suffix}`;
    },
  );
  if (!references) {
    throw new Error('README.md has no language image references. Add the supplied picture block first.');
  }
  return updated;
}

export async function main(env = process.env) {
  const totals = await collectLanguages({ token: env.LANGUAGE_STATS_TOKEN, owner: env.STATS_OWNER });
  // Historical SVGs are comparison baselines only. Current totals always come from the API above.
  const repository = env.STATS_REPOSITORY || env.GITHUB_REPOSITORY || `${env.STATS_OWNER.trim()}/${env.STATS_OWNER.trim()}`;
  const ref = env.STATS_REF || env.GITHUB_REF_NAME || 'main';
  const baseline = await load24HourBaseline({ repository, ref });
  console.log(baseline ? `24h baseline: ${baseline.observedAt}, snapshot ${baseline.commit}, target ${baseline.cutoffAt}.` : '24h baseline unavailable; change indicators are omitted.');
  const light = renderSvg(totals, false, baseline);
  const dark = renderSvg(totals, true, baseline);
  let readme;
  try {
    readme = await readFile(resolve('README.md'), 'utf8');
  } catch {
    throw new Error('Cannot read README.md. Add the supplied picture block to the profile README first.');
  }
  // The version changes only when the displayed image changes, so unchanged runs create no commit.
  const version = createHash('sha256').update(light).update('\0').update(dark).digest('hex').slice(0, 12);
  const updatedReadme = updateReadmeImages(readme, version, {
    repository, ref,
  });
  // Only aggregate SVGs and their README references are written. No raw repository data is saved.
  const directory = resolve('assets');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'languages.svg'), light, 'utf8');
  await writeFile(resolve(directory, 'languages-dark.svg'), dark, 'utf8');
  if (updatedReadme !== readme) await writeFile(resolve('README.md'), updatedReadme, 'utf8');
  // Remove obsolete generated images and entry points after successful generation.
  await rm(resolve(directory, 'private-languages.svg'), { force: true });
  await rm(resolve(directory, 'private-languages-dark.svg'), { force: true });
  await rm(resolve('.github', 'workflows', 'private-languages.yml'), { force: true });
  await rm(resolve('scripts', 'private-languages.mjs'), { force: true });
  console.log(`Updated language cards and README image versions from GitHub API: ${totals.size} languages, ${[...totals.values()].reduce((sum, bytes) => sum + bytes, 0)} bytes. Only aggregate shares and code sizes were saved.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Language statistics failed: ${error.message}`);
    process.exitCode = 1;
  });
}
