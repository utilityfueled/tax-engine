# Diagnostic observer only. The original file and every assertion remain unchanged.
set testdir /qualification-work/baseline/test
set argv0 /qualification-work/baseline/ext/recover/recoverfault2.test
set argv {}
source $testdir/tester.tcl
proc capture_2330 {command op} {
  if {[lindex $command 1] ne "recoverfault2-2-oom-transient.2330"} return
  set rows {}
  foreach sql $::lSql {
    set class OTHER
    if {[regexp -nocase {^\s*(BEGIN|COMMIT|PRAGMA|CREATE|INSERT|SELECT|NULL)\M} $sql unused first]} {set class [string toupper $first]}
    lappend rows [format {{"class":"%s","characters":%d,"hasNullToken":%s,"startsNullToken":%s}} $class [string length $sql] [expr {[regexp -nocase {\mNULL\M} $sql]?"true":"false"}] [expr {[regexp -nocase {^\s*NULL\M} $sql]?"true":"false"}]]
  }
  set out [open /qualification-out/oom-2330-metadata.json {WRONLY CREAT EXCL}]
  puts $out [format {{"case":"recoverfault2-2-oom-transient.2330","statementCount":%d,"statements":[%s],"sqlChanged":false,"oracleChanged":false}} [llength $rows] [join $rows ,]]
  close $out
}
trace add execution do_test enter capture_2330
source $argv0
