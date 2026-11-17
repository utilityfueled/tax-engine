#define _GNU_SOURCE
#include <sqlite3.h>
#include <dlfcn.h>
#include <stdio.h>
#include <string.h>
int main(int argc,char **argv){
 if(argc!=2 || (strcmp(argv[1],"baseline") && strcmp(argv[1],"dbpage")))return 2;
 void *resolved=dlsym(RTLD_DEFAULT,"sqlite3_libversion");
 Dl_info d;if(!resolved||!dladdr(resolved,&d)||!d.dli_fname)return 2;
 sqlite3 *db=0;sqlite3_stmt *s=0;
 if(sqlite3_open(":memory:",&db)!=SQLITE_OK)return 2;
 if(sqlite3_prepare_v2(db,"SELECT name FROM pragma_module_list WHERE name='sqlite_dbpage'",-1,&s,0)!=SQLITE_OK)return 2;
 int rc=sqlite3_step(s);if(rc!=SQLITE_ROW&&rc!=SQLITE_DONE)return 2;
 printf("variant\t%s\npath\t%s\nversion\t%s\nsourceId\t%s\ndbpage\t%d\n",argv[1],d.dli_fname,sqlite3_libversion(),sqlite3_sourceid(),rc==SQLITE_ROW);
 for(int i=0;;i++){const char *v=sqlite3_compileoption_get(i);if(!v)break;printf("option\t%s\n",v);}
 sqlite3_finalize(s);return sqlite3_close(db)==SQLITE_OK?0:2;
}
